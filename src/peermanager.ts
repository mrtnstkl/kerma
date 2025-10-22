import { db } from './object'
import { logger } from './logger'
import isValidHostname from 'is-valid-hostname'
import * as rt from 'runtypes'

const BOOTSTRAP_PEERS: string[] = [
  '128.130.122.73:18018'
]

class PeerManager {
  knownPeers: Set<string> = new Set()

  async load() {
    let peersFromDb: string[] = []
    if (await db.exists('knownPeers'))
    {
      try {
        peersFromDb = rt.Array(rt.String).check(await db.get('knownPeers'))
        logger.info(`Loaded %d known peers from database`, peersFromDb.length)
      } catch (e) {
        logger.error(`Failed to load known peers from database: %o`, e)
      }
    } else {
      logger.info(`No peers key in database`)
    }
    this.knownPeers = new Set(peersFromDb)

    if (this.knownPeers.size == 0) {
      logger.info(`Bootstrapping known peers`)
      this.knownPeers = new Set(BOOTSTRAP_PEERS)
      await this.store()
    }
  }

  async store() {
    try {
      await db.put('knownPeers', Array.from(this.knownPeers))
    } catch (error) {
      logger.error(`Failed to store known peers to database: %o`, error)
    }
    logger.info(`Stored %d known peers to database`, this.knownPeers.size)
  }

  peerDiscovered(peerAddr: string) {
    // todo: validate address
    if (!this.knownPeers.has(peerAddr)) {
      logger.info(`Discovered new peer: ${peerAddr}`)
      this.knownPeers.add(peerAddr)
      this.store()
    }
  }

  /**
   * If a peer is faulty, then remove it from your known peers
   * @param peerAddr the faulty peer
   */
  peerFailed(peerAddr: string) {
    if (this.knownPeers.has(peerAddr)) {
      logger.info(`Removing faulty peer from known peers: ${peerAddr}`)
      this.knownPeers.delete(peerAddr)
      this.store()
    }
  }
}

export const peerManager = new PeerManager()
