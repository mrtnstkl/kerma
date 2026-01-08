import { db } from './object'
import { logger } from './logger'
import isValidHostname from 'is-valid-hostname'

const BOOTSTRAP_PEERS: string[] = [
  '128.130.122.73:18018'
]

class PeerManager {
  knownPeers: Set<string> = new Set()
  connectedPeers: Set<string> = new Set()

  async load() {
    try {
      this.knownPeers = new Set(await db.get('peers'))
      logger.debug(`Loaded known peers: ${[...this.knownPeers]}`)
    }
    catch {
      logger.info(`Initializing peers database`)
      this.knownPeers = new Set(BOOTSTRAP_PEERS)
      await this.store()
    }
  }
  async store() {
    await db.put('peers', [...this.knownPeers])
  }

  private shuffleArray(array: Array<String>) : Array<String> {
    let len = array.length,
        currentIndex;
    for (currentIndex = len - 1; currentIndex > 0; currentIndex--) {
      let randIndex = Math.floor(Math.random() * (currentIndex + 1) );
      var temp = array[currentIndex];
      array[currentIndex] = array[randIndex];
      array[randIndex] = temp;
    }
    return array
  }

  getSomePeers(count: number) {
    return this.shuffleArray([...this.knownPeers]).slice(0, count)
  }

  isValidDNSEntry(addr: string) : boolean {
    let regex = new RegExp("^[a-zA-Z\\d\\.\\-\\_]{3,50}$");
    if (!regex.test(addr))
       return false

    if (addr.search(/[a-zA-Z]/) < 0)
      return false

    if (addr.substring(1, addr.length - 1).search(/\./) < 0)
      return false
    return true
  }

  isValidIpv4(addr: string) : boolean {
    let regex = new RegExp("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$");
    if (!regex.test(addr))
      return false

    const ipParts = addr.split('.')
    return !(+ipParts[0] > 255 || +ipParts[1] > 255 || +ipParts[2] > 255 || +ipParts[3] > 255);
  }


  isValidHostname(addr: string) : boolean {
    return this.isValidIpv4(addr) || this.isValidDNSEntry(addr)
  }

  peerDiscovered(peerAddr: string) {
    this.knownPeers.add(peerAddr)
    this.store() // intentionally delayed await
    logger.info(`Known peers: ${this.knownPeers.size}`)
  }
  peerFailed(peerAddr: string) {
    logger.warn(`Removing known peer, as it is considered faulty`)
    this.knownPeers.delete(peerAddr)
    this.connectedPeers.delete(peerAddr)
    this.store() // intentionally delayed await
    logger.info(`Known peers: ${this.knownPeers.size}`)
  }
}

export const peerManager = new PeerManager()
