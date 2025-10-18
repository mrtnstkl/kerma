import { Block } from './block'
import { Chain } from './chain'
import { logger } from './logger'
import { db, ObjectId, objectManager } from './object'
import { Transaction } from './transaction'
import { UTXOSet } from './utxo'

/**
 * Handles the state of the Mining Pool
 */
class MemPool {
  /* TODO */

  async init() {
    await this.load()
    logger.debug('Mempool initialized')
  }

  /**
   * @returns all IDs from the transactions in the mempool
   */
  getTxIds(): ObjectId[] {
    /* TODO */
    const x : ObjectId[] = [];
    return x;
  }

  /**
   * Creates a mempool from transaction IDs
   * @param txids 
   */
  async fromTxIds(txids: ObjectId[]) {
    /* TODO */
  }

  /**
   * save this mempool state
   */
  async save() {
   /* TODO */
  }

  /**
   * load mempool state
   */
  async load() {
    /* TODO */
  }

  /**
   * on arrival of a new transaction, update the mempool if possible
   * @param tx 
   * @returns true iff tx has been successfully added to the mempool
   */
  async onTransactionArrival(tx: Transaction): Promise<boolean> {
    /* TODO */
    return false;
  }

  /**
   * reorganises the mempool on blockchain fork
   * @param lca 
   * @param shortFork 
   * @param longFork 
   */
  async reorg(lca: Block, shortFork: Chain, longFork: Chain) {
    /* TODO */
  }
}

export const mempool = new MemPool()
