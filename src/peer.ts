import { logger } from './logger';
import { MessageSocket } from './network';
import {
  Messages,
  Message,
  HelloMessage,
  PeersMessage,
  GetPeersMessage,
  IHaveObjectMessage,
  GetObjectMessage,
  ObjectMessage,
  GetChainTipMessage,
  ChainTipMessage,
  ErrorMessage,
  MessageType,
  HelloMessageType,
  PeersMessageType,
  GetPeersMessageType,
  IHaveObjectMessageType,
  GetObjectMessageType,
  ObjectMessageType,
  GetChainTipMessageType,
  ChainTipMessageType,
  ErrorMessageType,
  GetMempoolMessageType,
  MempoolMessageType,
  ErrorCodeType,
  GetMempoolMessage,
  MempoolMessage,
  GeneralTransactionObjectType,
  TransactionObject,
  GeneralTransactionObject,
  BlockObject,
} from './message';
import { peerManager } from './peermanager';
import { db, objectManager } from './object';
import { network } from './network';
import { ObjectId } from './object';
import { chainManager } from './chain';
import { mempool } from './mempool';
import { Transaction } from './transaction';
import { match, when } from 'runtypes';
import { Block, blockManager } from './block';

const VERSION = '0.10.0';
const NAME = 'b0b3r';
const HOST_ADDRESS = 'kerma.gnorts.xyz:18018';

const HANDSHAKE_WAIT_TIME = 20000;

const ERROR_MESSAGES = {
  ILLEGAL_FIELDS: 'Message contains illegal fields.',
};

// Number of peers that each peer is allowed to report to us
const MAX_PEERS_PER_PEER = 30;

export class Peer {
  socket: MessageSocket;
  peerAddr: string;
  handshakeCompleted = false;
  /* TODO */

  async sendHello() {
    const hello: HelloMessageType = {
      type: 'hello',
      version: VERSION,
      agent: NAME,
    };

    this.sendMessage(hello);
  }
  async sendGetPeers() {
    const getPeersRequest: GetPeersMessageType = {
      type: 'getpeers',
    };

    this.sendMessage(getPeersRequest);
  }
  async sendPeers() {
    const sendPeersMessage: PeersMessageType = {
      type: 'peers',
      peers: [HOST_ADDRESS, ...[...peerManager.knownPeers].slice(0, MAX_PEERS_PER_PEER - 1)],
    };

    this.sendMessage(sendPeersMessage);
  }
  async sendIHaveObject(objid: ObjectId) {
    const ihaveobject: IHaveObjectMessageType = {
      type: 'ihaveobject',
      objectid: objid,
    };
    this.sendMessage(ihaveobject);
  }
  async sendObject(obj: any) {
    const objectMessage: ObjectMessageType = {
      type: 'object',
      object: obj,
    };
    this.sendMessage(objectMessage);
  }
  async sendGetObject(objid: ObjectId) {
    const getobject: GetObjectMessageType = {
      type: 'getobject',
      objectid: objid,
    };
    this.sendMessage(getobject);
  }
  async sendGetChainTip() {
    const getChainTip: GetChainTipMessageType = {
      type: 'getchaintip',
    };
    this.sendMessage(getChainTip);
  }
  async sendChainTip(blockid: ObjectId) {
    const chainTip: ChainTipMessageType = {
      type: 'chaintip',
      blockId: blockid,
    };
    this.sendMessage(chainTip);
  }
  async sendGetMempool() {
    /* TODO */
  }
  async sendMempool(txids: ObjectId[]) {
    /* TODO */
  }
  async sendError(errorCode: ErrorCodeType, errorMessage: string) {
    const error: ErrorMessageType = {
      type: 'error',
      name: errorCode,
      msg: errorMessage,
    };

    this.sendMessage(error);
  }
  sendMessage(obj: MessageType, callback?: (err?: Error) => void) {
    const message = JSON.stringify(obj);
    this.socket.sendMessage(message, callback);
  }
  async fatalError(errorCode: ErrorCodeType, errorMessage: string) {
    const error: ErrorMessageType = {
      type: 'error',
      name: errorCode,
      msg: errorMessage,
    };

    this.sendMessage(error, () => {
      this.fail();
    });
  }

  async fail() {
    peerManager.peerFailed(this.peerAddr);
    this.info(`closing connection`);
    this.socket.end();
  }

  async onConnect() {
    this.info(`onConnect called`);
    await this.sendHello();
    //immediately request for known peers
    await this.sendGetPeers();
    await this.sendGetChainTip();

    setTimeout(() => {
      if (!this.handshakeCompleted) {
        this.fatalError(
          'INVALID_HANDSHAKE',
          'Did not receive a handshake 20 seconds after establishing a connection',
        );
      }
    }, HANDSHAKE_WAIT_TIME);
  }

  async onMessage(message: string) {
    this.debug(`Message arrival: ${message}`);

    let msg: object;

    try {
      msg = JSON.parse(message);
    } catch {
      this.log('error', 'Invalid JSON format');

      // If the node did not perform a handshake yet, invalid messages from it should be treated
      // as invalid handshake attempts.
      if (this.handshakeCompleted) {
        return this.fatalError('INVALID_FORMAT', 'Could not parse message json.');
      } else {
        return this.fatalError('INVALID_HANDSHAKE', 'Received invalid message before handshake.');
      }
    }

    if (!this.handshakeCompleted) {
      if (!HelloMessage.guard(msg)) {
        this.log('error', 'Invalid message, expected handshake message');
        return this.fatalError(
          'INVALID_HANDSHAKE',
          'Did not receive a hello message as the first message.',
        );
      }
      return this.onMessageHello(msg);
    }

    // check if this msg is a valid Message
    if (!Message.guard(msg)) {
      return this.fatalError('INVALID_FORMAT', 'The JSON did not match any message format.');
    }

    Message.match(
      this.onMessageHello.bind(this),
      this.onMessageGetPeers.bind(this),
      this.onMessagePeers.bind(this),
      this.onMessageIHaveObject.bind(this),
      this.onMessageGetObject.bind(this),
      this.onMessageObject.bind(this),
      this.onMessageGetChainTip.bind(this),
      this.onMessageChainTip.bind(this),
      this.onMessageGetMempool.bind(this),
      this.onMessageMempool.bind(this),
      this.onMessageError.bind(this),
    )(msg);
  }

  async onMessageHello(msg: HelloMessageType) {
    // This assumes higher precence of this error over the subsequent handshake error.
    // Invalid message => Is not a valid subsequent hello message
    if (this.hasExtraFields(msg, HelloMessage.fields)) {
      const errorCode: ErrorCodeType = this.handshakeCompleted
        ? 'INVALID_FORMAT'
        : 'INVALID_HANDSHAKE';
      return this.fatalError(errorCode, ERROR_MESSAGES.ILLEGAL_FIELDS);
    }

    if (this.handshakeCompleted) {
      this.warn('Subsequent hello message received');
      return this.fatalError('INVALID_HANDSHAKE', 'Received a subsequent handshake message');
    }

    this.info('Hello message received');
    this.handshakeCompleted = true;
  }
  async onMessagePeers(msg: PeersMessageType) {
    if (this.hasExtraFields(msg, PeersMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }

    //Max entry size 30
    if (msg.peers.length > 30) {
      return await this.fatalError('INVALID_FORMAT', `Sent too many peers`);
    }

    //Check if all peers are valid
    for (const peer of msg.peers) {
      if (!peerManager.validateAddress(peer)) {
        // If any peer is invalid, reject the entire message.
        return await this.fatalError('INVALID_FORMAT', `Invalid peer ${peer}`);
      }
    }

    //Only if all peers were valid, add all of them with another loop
    for (const peer of msg.peers) {
      this.info(`Peer known: ${peer}`);
      peerManager.peerDiscovered(peer);
    }
  }
  async onMessageGetPeers(msg: GetPeersMessageType) {
    if (this.hasExtraFields(msg, GetPeersMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }

    this.info(`Requesting Peers message received`);
    await this.sendPeers();
  }
  async onMessageIHaveObject(msg: IHaveObjectMessageType) {
    if (this.hasExtraFields(msg, IHaveObjectMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }
    // check if we have the object
    if (!(await objectManager.exists(msg.objectid))) {
      // we dont, so request it
      this.info(`Requesting object ${msg.objectid} from peer`);
      await this.sendGetObject(msg.objectid);
    }
    // ignore if we already have it
  }
  async onMessageGetObject(msg: GetObjectMessageType) {
    if (this.hasExtraFields(msg, GetObjectMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }
    // check if we have the object
    if (await objectManager.exists(msg.objectid)) {
      // we do, so send it
      const object = await objectManager.get(msg.objectid);
      this.info(`Sending object ${msg.objectid} to peer`);
      await this.sendObject(object);
    } else {
      // we dont, so send error
      this.debug(`Requested object ${msg.objectid} not found locally`);
      return this.sendError('UNKNOWN_OBJECT', `Object ${msg.objectid} not known`);
    }
  }
  async onMessageObject(msg: ObjectMessageType) {
    if (this.hasExtraFields(msg, ObjectMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }
    // check if we have the object
    if (await objectManager.exists(objectManager.id(msg.object))) {
      this.debug(`Received object is already known: ${objectManager.id(msg.object)}`);
      return;
    }

    await match(
      when(GeneralTransactionObject, async (transaction) => {
        const validation = await Transaction.validate(transaction);

        if (!validation.success) {
          this.debug(`Received object is invalid: ${validation.error.msg}`);
          if (validation.error.name === 'UNKNOWN_OBJECT') {
            return this.sendError(validation.error.name, validation.error.msg);
          } else {
            return this.fatalError(validation.error.name, validation.error.msg);
          }
        }

        this.info(`Received new object from peer`);
        const objectId = await objectManager.put(transaction);

        // Gossip to other peers
        network.broadcast(objectId);
      }),
      when(BlockObject, async (block) => {
        const blk = await Block.fromNetworkObject(block);
        const validation = await blk.validate();
        if (!validation.success) {
          this.debug(`Received block is invalid: ${validation.error.msg}`);

          // Some errors should not be fatal
          if (validation.error.name === 'UNFINDABLE_OBJECT') {
            return this.sendError(validation.error.name, validation.error.msg);
          }

          return this.fatalError(validation.error.name, validation.error.msg);
        } else {
          // store the block
          await blockManager.put(blk);
          await chainManager.onValidBlockArrival(blk);
          // gossip to other peers
          network.broadcast(blk.hash());
        }
      }),
    )(msg.object);
  }
  async onMessageGetChainTip(msg: GetChainTipMessageType) {
    if (this.hasExtraFields(msg, GetChainTipMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }
    // check if we have the object
    if (chainManager.head) {
      // we do, so send it
      this.info(`Sending chain tip to peer`);
      await this.sendChainTip(objectManager.id(chainManager.head));
    } else {
      this.debug(`Chain tip not found locally, sending error message`);
      return this.sendError('UNKNOWN_OBJECT', `Chain tip not found`);
    }
  }
  async onMessageChainTip(msg: ChainTipMessageType) {
    if (this.hasExtraFields(msg, ChainTipMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }

    const blockId = msg.blockId;

    if (!(await objectManager.exists(blockId))) {
      this.info(`Received Chain tip for unknown block ${blockId}. Requesting from all peers...`);
      const getObjectMsg: GetObjectMessageType = {
        type: 'getobject',
        objectid: blockId,
      };
      if (typeof network !== 'undefined' && network.peers) {
        network.peers.forEach((peer) => {
          if (peer.peerAddr !== this.peerAddr) {
            peer.sendMessage(getObjectMsg);
          }
        });
      }
      return;
    }

    const obj = await objectManager.get(blockId);
    if (!BlockObject.guard(obj)) {
      this.debug(`ChainTip referenced a non-block object: ${blockId}`);
      return this.fatalError('INVALID_FORMAT', `Object ${blockId} is not a block.`);
    }

    try {
      const block = await Block.fromNetworkObject(obj);
      const validation = await block.validate();

      if (!validation.success) {
        this.debug(`ChainTip block is invalid: ${validation.error.msg}`);
        return this.fatalError(
          'INVALID_BLOCK_POW',
          `Block ${blockId} has invalid PoW or structure.`,
        );
      }
    } catch (e) {
      this.warn(`Error validating ChainTip block: ${e}`);
      return this.fatalError('INVALID_FORMAT', `Could not validate block ${blockId}`);
    }
  }
  async onMessageGetMempool(msg: GetMempoolMessageType) {
    if (this.hasExtraFields(msg, GetMempoolMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }
    /* TODO */
  }
  async onMessageMempool(msg: MempoolMessageType) {
    if (this.hasExtraFields(msg, MempoolMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }
    /* TODO */
  }
  async onMessageError(msg: ErrorMessageType) {
    if (this.hasExtraFields(msg, ErrorMessage.fields)) {
      return this.fatalError('INVALID_FORMAT', ERROR_MESSAGES.ILLEGAL_FIELDS);
    }
    /* TODO */
  }
  // Validate if an object contains additional fields, not defined in its
  // runtypes type. This has to be performed, as runtypes in its 6.x version
  // doesn't support strict checking. All other schema verification is handled
  // with the the runtypes' types.
  //
  // IMPORTANT:
  // - THIS ASSUMES CORRECTNESS CHECK WAS ALREADY PERFORMED (object contains all required fields)
  // - THIS ASSUMES NO OPTIONAL FIELDS
  hasExtraFields(msg: Object, template: Object) {
    return Object.keys(msg).length !== Object.keys(template).length;
  }
  log(level: string, message: string, ...args: any[]) {
    logger.log(level, `[Peer ${this.peerAddr}]: ${message}`, ...args);
  }
  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args);
  }
  info(message: string, ...args: any[]) {
    this.log('info', message, ...args);
  }
  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args);
  }
  constructor(socket: MessageSocket, peerAddr: string) {
    this.socket = socket;
    this.peerAddr = peerAddr;

    socket.netSocket.on('connect', this.onConnect.bind(this));
    socket.netSocket.on('error', (err) => {
      this.warn(`Socket error: ${err}`);
      this.fail();
    });
    socket.on('message', this.onMessage.bind(this));
  }
}
