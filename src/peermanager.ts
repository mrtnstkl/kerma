import { db } from './object'
import { logger } from './logger'
import isValidHostname from 'is-valid-hostname'

const BOOTSTRAP_PEERS: string[] = [
  /* TODO */
]

class PeerManager {
  knownPeers: Set<string> = new Set()

  async load() {
    /* TODO */
  }
  
  async store() {
    /* TODO */
  }

  peerDiscovered(peerAddr: string) {
    /* TODO */
  }

  /**
   * If a peer is faulty, then remove it from your known peers
   * @param peerAddr the faulty peer
   */
  peerFailed(peerAddr: string) {
    /* TODO */
  }
}

export const peerManager = new PeerManager()
