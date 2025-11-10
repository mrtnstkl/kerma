import * as net from 'net'
import * as readline from 'readline'
import { logger } from './logger'
import { Peer } from './peer'
import { EventEmitter } from 'events'
import { peerManager } from './peermanager'

class Network {
  peers: Set<string> = new Set()

  async init(bindPort: number, bindIP: string) {
    await peerManager.load()

    const server = net.createServer(socket => {
      const remoteAddrWithPort = `${socket.remoteAddress}:${socket.remotePort}`
      logger.info(`New connection from peer ${remoteAddrWithPort}`)

      if (socket.remoteAddress === undefined) {
        logger.error(`Connected peer doesn't have a remote address`)
        return
      }

      const client = new MessageSocket(socket, remoteAddrWithPort)
      const peer = new Peer(client, remoteAddrWithPort)

      this.peers.add(peer.peerAddr)

      // As there will be no connect event sent by the socket, notify the peer about the connection here.
      peer.onConnect()
      peerManager.peerDiscovered(remoteAddrWithPort)
    })

    logger.info(`Listening for connections on port ${bindPort} and IP ${bindIP}`)
    server.listen(bindPort, bindIP)

    logger.info('Performing initial connection to all known peers...')

    for (const peerAddr of peerManager.knownPeers) {
        if (this.peers.has(peerAddr)){
            //connection already there
            continue
        }
        try {
            const client = MessageSocket.createClient(peerAddr)
            const peer = new Peer(client, peerAddr)
            this.peers.add(peerAddr)
            await peer.onConnect()
        } catch (error) {
            //Node not reachable, drop it
            logger.warn(`Failed to connect to peer ${peerAddr}. Dropping...`)
            peerManager.peerFailed(peerAddr)
        }
      }
  }

  broadcast(obj: object) {
    logger.info(`Broadcasting object to all peers: %o`, obj)

    /* TODO */
  }
}

export class MessageSocket extends EventEmitter {
  netSocket: net.Socket
  readlineInterface: readline.Interface
  peerAddr: string
  buffer: string = ''
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

    // Use node's library for defragmentation
    this.readlineInterface = readline.createInterface({
      input: netSocket,
      crlfDelay: Infinity // TODO: Read in the description if it's defined 
    })

    this.readlineInterface.on('line', (line) => {
      this.emit('message', line)
    })
  }

  sendMessage(message: string, callback?: (err?: Error) => void) {
    if (this.netSocket.destroyed || this.netSocket.writableEnded) {
      logger.warn(`Tried to write after socket closed`);
      return;
    }

    this.netSocket.write(message + '\n', callback)
  }

  end() {
    this.netSocket.destroy();
    // TODO: Should anything else happen here?
  }
}

export const network = new Network()
