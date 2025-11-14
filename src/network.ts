import * as net from 'net';
import * as readline from 'readline';
import { logger } from './logger';
import { Peer } from './peer';
import { EventEmitter } from 'events';
import { peerManager } from './peermanager';
import { ObjectId } from './object';

class Network {
  peers: Set<Peer> = new Set();

  async init(bindPort: number, bindIP: string) {
    await peerManager.load();

    const server = net.createServer((socket) => {
      const remoteAddrWithPort = `${socket.remoteAddress}:${socket.remotePort}`;
      logger.info(`New connection from peer ${remoteAddrWithPort}`);

      if (socket.remoteAddress === undefined) {
        logger.error(`Connected peer doesn't have a remote address`);
        return;
      }

      const client = new MessageSocket(socket, remoteAddrWithPort);
      const peer = new Peer(client, remoteAddrWithPort);

      this.peers.add(peer);
      client.netSocket.on('close', _ => this.peers.delete(peer));

      // As there will be no connect event sent by the socket, notify the peer about the connection here.
      peer.onConnect();
      peerManager.peerDiscovered(remoteAddrWithPort);
    });

    server.on('error', (err) => {
      logger.error(`Server received an error: ${err}`);
    });

    logger.info(`Listening for connections on port ${bindPort} and IP ${bindIP}`);
    server.listen(bindPort, bindIP);

    logger.info('Performing initial connection to all known peers...');

    for (const peerAddr of peerManager.knownPeers) {
      if ([...this.peers].some((peer) => peer.peerAddr === peerAddr)) {
        // connection already there
        continue;
      }
      try {
        const client = await MessageSocket.createClient(peerAddr);
        const peer = new Peer(client, peerAddr);

        // In createClient we listen for 'connect' event, so the peer won't get it.
        peer.onConnect();

        this.peers.add(peer);
        client.netSocket.on('close', _ => this.peers.delete(peer));
      } catch (error) {
        // Node not reachable, drop it
        logger.warn(`Failed to connect to peer ${peerAddr}. Dropping...`);
        peerManager.peerFailed(peerAddr);
      }
    }
  }

  broadcast(oid: ObjectId) {
    logger.info(`Broadcasting object to ${this.peers.size} connected peers: ${oid}`);
    this.peers.forEach(peer => peer.sendIHaveObject(oid));
  }
}

export class MessageSocket extends EventEmitter {
  netSocket: net.Socket;
  readlineInterface: readline.Interface;
  peerAddr: string;

  static createClient(peerAddr: string): Promise<MessageSocket> {
    return new Promise((resolve, reject) => {
      const [host, portStr] = peerAddr.split(':');
      const port = parseInt(portStr, 10);

      const netSocket = new net.Socket();

      netSocket.on('error', (err) => {
        netSocket.destroy();
        reject(err); // This will be caught by the try...catch in Network.init
      });

      netSocket.connect(port, host, () => {
        // Create the MessageSocket after connecting
        const socket = new MessageSocket(netSocket, peerAddr);
        resolve(socket); // Return the connected socket
      });
    });
  }

  constructor(netSocket: net.Socket, peerAddr: string) {
    super();

    this.peerAddr = peerAddr;
    this.netSocket = netSocket;

    // Use node's library for defragmentation
    this.readlineInterface = readline.createInterface({
      input: netSocket,
      crlfDelay: Infinity, // TODO: Read in the description if it's defined
    });

    this.readlineInterface.on('line', (line) => {
      this.emit('message', line);
    });
  }

  sendMessage(message: string, callback?: (err?: Error) => void) {
    if (!this.netSocket.writable) {
      logger.warn(`Tried to write after socket closed`);
      return;
    }

    this.netSocket.write(message + '\n', callback);
  }

  end() {
    this.netSocket.end();
    // TODO: Should anything else happen here?
  }
}

export const network = new Network();
