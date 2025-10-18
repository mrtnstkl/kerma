import * as net from 'net'
import { logger } from './logger'
import { Peer } from './peer'
import { EventEmitter } from 'events'
import { peerManager } from './peermanager'

class Network {
  /* TODO */

  async init(bindPort: number, bindIP: string) {
    await peerManager.load()

    const server = net.createServer(socket => {
      logger.info(`New connection from peer ${socket.remoteAddress}`)
      /* TODO */
      // add peer to known peers
    })

    logger.info(`Listening for connections on port ${bindPort} and IP ${bindIP}`)
    server.listen(bindPort, bindIP)

    /* TODO */
    // perform initial connection to known peers 
  }

  broadcast(obj: object) {
    logger.info(`Broadcasting object to all peers: %o`, obj)

    /* TODO */
  }
}

export class MessageSocket extends EventEmitter {
  netSocket: net.Socket
  peerAddr: string
  /* TODO */

  static createClient(peerAddr: string) {
    /* TODO */
    const netSocket = new net.Socket()
    const socket = new MessageSocket(netSocket, peerAddr)
    /* TODO */
    return socket
  }

  constructor(netSocket: net.Socket, peerAddr: string) {
    super()

    this.peerAddr = peerAddr
    this.netSocket = netSocket
    // what to do when data arrives
    this.netSocket.on('data', (data: string) => {
      /* TODO: handle data */
    })
    /* TODO */
  }

  sendMessage(message: string) {
    /* TODO */
  }

  end() {
    /* TODO */
  }
}

export const network = new Network()
