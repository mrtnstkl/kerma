import { logger } from './logger'
import { MessageSocket } from './network'
import { Messages,
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
         MempoolMessageType
        } from './message'
import { peerManager } from './peermanager'
import { db, objectManager } from './object'
import { network } from './network'
import { ObjectId } from './object'
import { chainManager } from './chain'
import { mempool } from './mempool'

const VERSION = 'x.y.z' /* TODO */
const NAME = 'name' /* TODO */

// Number of peers that each peer is allowed to report to us
const MAX_PEERS_PER_PEER = 30

export class Peer {
  socket: MessageSocket
  peerAddr: string
  /* TODO */

  async sendHello() {
    /* TODO */
  }
  async sendGetPeers() {
    /* TODO */
  }
  async sendPeers() {
    /* TODO */
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
  async sendError(err: string) {
    /* TODO */
  }
  sendMessage(obj: object) {
    /* TODO */
  }
  async fatalError(err: string) {
    /* TODO */
  }
  async fail() {
    /* TODO */
  }
  async onConnect() {
    /* TODO */
  }
  async onMessage(message: string) {
    this.debug(`Message arrival: ${message}`)

    let msg: object = {}

    /* TODO */

    // check if this msg is a valid Message
    if (!Message.guard(msg)){
      /* TODO */
    }
    /* TODO */
    /*Message.match(
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
    )(msg)*/
  }

  async onMessageHello(msg: HelloMessageType) {
    /* TODO */
  }
  async onMessagePeers(msg: PeersMessageType) {
    /* TODO */
  }
  async onMessageGetPeers(msg: GetPeersMessageType) {
    /* TODO */
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
      `Add further debug info ${message}`,
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
