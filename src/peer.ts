import { logger } from './logger'
import { MessageSocket } from './network'
import {
  Messages,
  Message,
  HelloMessage,
  PeersMessage, GetPeersMessage,
  IHaveObjectMessage, GetObjectMessage, ObjectMessage,
  GetChainTipMessage, ChainTipMessage,
  ErrorMessage,
  MessageType,
  HelloMessageType,
  PeersMessageType, GetPeersMessageType,
  IHaveObjectMessageType, GetObjectMessageType, ObjectMessageType,
  GetChainTipMessageType, ChainTipMessageType,
  ErrorMessageType,
  GetMempoolMessageType,
  MempoolMessageType,
  ErrorCodeType
} from './message'
import { peerManager } from './peermanager'
import { db, objectManager } from './object'
import { network } from './network'
import { ObjectId } from './object'
import { chainManager } from './chain'
import { mempool } from './mempool'

const VERSION = '0.10.0'
const NAME = 'b0b3r'
const HOST_ADDRESS = 'kerma.gnorts.xyz:18018'

const HANDSHAKE_WAIT_TIME = 20000

// Number of peers that each peer is allowed to report to us
const MAX_PEERS_PER_PEER = 30

export class Peer {
  socket: MessageSocket
  peerAddr: string
  handshakeCompleted = false
  /* TODO */

  async sendHello() {
    const hello: HelloMessageType = {
      type: 'hello',
      version: VERSION,
      agent: NAME,
    }

    this.sendMessage(hello)
  }
  async sendGetPeers() {
    const getPeersRequest: GetPeersMessageType = {
        type: 'getpeers'
    };

    this.sendMessage(getPeersRequest);
  }
  async sendPeers() {
    const sendPeersMessage: PeersMessageType = {
        type: 'peers',
        peers: [HOST_ADDRESS,...[...peerManager.knownPeers].slice(0, MAX_PEERS_PER_PEER)]
    }

    this.sendMessage(sendPeersMessage);
  }
  async sendIHaveObject(obj: any) {
    /* TODO */
  }
  async sendObject(obj: any) {
    /* TODO */
  }
  async sendGetObject(objid: ObjectId) {
    /* TODO */
  }
  async sendGetChainTip() {
    /* TODO */
  }
  async sendChainTip(blockid: ObjectId) {
    /* TODO */
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
      msg: errorMessage
    }

    this.sendMessage(error)
  }
  sendMessage(obj: MessageType, callback?: (err?: Error) => void) {
    const message = JSON.stringify(obj)
    this.socket.sendMessage(message, callback)
  }
  async fatalError(errorCode: ErrorCodeType, errorMessage: string) {
    const error: ErrorMessageType = {
      type: 'error',
      name: errorCode,
      msg: errorMessage
    }

    this.sendMessage(error, () => {
      this.fail()
    })
  }
  async fail() {
    /* TODO */
    peerManager.peerFailed(this.peerAddr)
    this.info(`closing connection`)
    this.socket.end()
  }
  async onConnect() {
    this.info(`onConnect called`)
    this.sendHello()

    setTimeout(() => {
      if (!this.handshakeCompleted) {
        this.fatalError('INVALID_HANDSHAKE', 'Did not receive a handshake 20 seconds after establishing a connection')
      }
    }, HANDSHAKE_WAIT_TIME)
  }
  async onMessage(message: string) {
    this.debug(`Message arrival: ${message}`)

    let msg: object

    try {
      msg = JSON.parse(message)
    } catch {
      this.log('error', 'Invalid JSON format')
      return this.fatalError('INVALID_FORMAT', 'Could not parse message json.')
      // TODO: Not sure if it should be fatal, consult with the professor
    }

    if (!this.handshakeCompleted) {
      if (!HelloMessage.guard(msg)) {
        this.log('error', 'Invalid message, expected handshake message')
        return this.fatalError('INVALID_HANDSHAKE', 'Did not receive a hello message as the first message.')
      }

      return this.onMessageHello(msg)
    }

    // check if this msg is a valid Message
    if (!Message.guard(msg)) {
      // TODO: Throw INVALID_FORMAT message
      return this.fatalError('INVALID_FORMAT', 'The JSON did not match any message format.')
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
      this.onMessageError.bind(this)
    )(msg)
  }

  async onMessageHello(msg: HelloMessageType) {
    if (this.handshakeCompleted) {
      this.warn('Subsequent hello message received')
      return this.fatalError('INVALID_HANDSHAKE', 'Received a subsequent handshake message')
    }

    this.info('Hello message received')
    this.handshakeCompleted = true
  }
  async onMessagePeers(msg: PeersMessageType) {
      if(msg.peers.length > 30)
          return await this.fatalError('INVALID_FORMAT', `Send too many peers`)

      for (const peer of msg.peers) {
          if (!peerManager.validateAddress(peer)) {
              return await this.fatalError('INVALID_FORMAT', `Invalid peer ${peer}`)
          } else {
              this.info(`Peer known: ${peer}`)
              peerManager.peerDiscovered(peer)
          }
      }
  }
  async onMessageGetPeers(msg: GetPeersMessageType) {
      this.info(`Requesting Peers message received`)
      await this.sendPeers()
  }
  async onMessageIHaveObject(msg: IHaveObjectMessageType) {
    /* TODO */
  }
  async onMessageGetObject(msg: GetObjectMessageType) {
    /* TODO */
  }
  async onMessageObject(msg: ObjectMessageType) {
    /* TODO */
  }
  async onMessageGetChainTip(msg: GetChainTipMessageType) {
    /* TODO */
  }
  async onMessageChainTip(msg: ChainTipMessageType) {
    /* TODO */
  }
  async onMessageGetMempool(msg: GetMempoolMessageType) {
    /* TODO */
  }
  async onMessageMempool(msg: MempoolMessageType) {
    /* TODO */
  }
  async onMessageError(msg: ErrorMessageType) {
    /* TODO */
  }
  log(level: string, message: string, ...args: any[]) {
    logger.log(
      level,
      `[Peer ${this.peerAddr}]: ${message}`,
      ...args
    )
  }
  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args)
  }
  info(message: string, ...args: any[]) {
    this.log('info', message, ...args)
  }
  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args)
  }
  constructor(socket: MessageSocket, peerAddr: string) {
    this.socket = socket
    this.peerAddr = peerAddr

    socket.netSocket.on('connect', this.onConnect.bind(this))
    socket.netSocket.on('error', err => {
      this.warn(`Socket error: ${err}`)
      this.fail()
    })
    socket.on('message', this.onMessage.bind(this))
  }
}
