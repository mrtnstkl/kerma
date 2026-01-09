import { Block } from './block'
import { Chain } from './chain'
import { CustomError } from './errors'
import { logger } from './logger'
import { db, ObjectId, objectManager } from './object'
import { Transaction } from './transaction'
import { UTXOSet } from './utxo'

/**
 * Handles the state of the Mining Pool
 */
class MemPool {
  txs: Transaction[] = []
  utxos: UTXOSet | undefined = undefined

  async init() {
    await this.load()
    logger.debug('Mempool initialized')
  }

  /**
   * @returns all IDs from the transactions in the mempool
   */
  getTxIds(): ObjectId[] {
    return this.txs.map(tx => tx.txid)
  }

  /**
   * Creates a mempool from transaction IDs
   * @param txids 
   */
  async fromTxIds(txids: ObjectId[]) {
    this.txs = []
    for (const txid of txids) {
      this.txs.push(Transaction.fromNetworkObject(await objectManager.get(txid)))
    }
  }

  /**
   * save this mempool state
   */
  async save() {
    if (this.utxos === undefined) {
      throw new Error('Mempool state undefined, cannot save.')
    }
    await db.put('mempool:txids', this.getTxIds())
    await db.put('mempool:utxos', Array.from(this.utxos.outpoints))
  }

  /**
   * load mempool state
   */
  async load() {
    try {
      await this.fromTxIds(await db.get('mempool:txids'))
      this.utxos = new UTXOSet(new Set<string>(await db.get('mempool:utxos')))
    } 
    catch {
      this.txs = []
      this.utxos = new UTXOSet(new Set())
      await this.save()
    }
  }

  /**
   * on arrival of a new transaction, update the mempool if possible
   * @param tx 
   * @returns true iff tx has been successfully added to the mempool
   */
  async onTransactionArrival(tx: Transaction): Promise<boolean> {
    try {
      if (tx.isCoinbase()) {
        throw new Error("Coinbase Transaction can't be added to mempool")
      }
      await this.utxos?.apply(tx)
    }
    catch (e: any) {
      logger.debug(`Failed to add transaction ${tx.txid} to mempool: ${e.message}.`)
      return false
    }
    logger.debug(`Added transaction ${tx.txid} to mempool`)
    this.txs.push(tx)
    await this.save()
    return true
  }

  /**
   * reorganises the mempool on blockchain fork
   * @param lca 
   * @param shortFork 
   * @param longFork 
   */
  async reorg(lca: Block, shortFork: Chain, longFork: Chain) {
    logger.info('Reorganizing mempool')

    const oldMempoolTxs: Transaction[] = this.txs
    let orphanedTxs: Transaction[] = []

    for (const block of shortFork.blocks) {
      orphanedTxs = orphanedTxs.concat(await block.getTxs())
    }
    orphanedTxs = orphanedTxs.concat(oldMempoolTxs)
    this.txs = []

    const tip = longFork.blocks[longFork.blocks.length - 1]
    if (tip.utxosAfter === undefined) {
      throw new Error("Mempool reorg failed: utxosAfter of new tip is undefined")
    }
    let successes = 0
    for (const tx of orphanedTxs) {
      const success = await this.onTransactionArrival(tx)
      if (success) {
        ++successes
      }
    }
    this.utxos = tip.utxosAfter
    await this.save()
  }
}

export const mempool = new MemPool()
