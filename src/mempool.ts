import { Block, blockManager } from './block';
import { Chain } from './chain';
import { logger } from './logger';
import { db, ObjectId, objectManager } from './object';
import { Transaction } from './transaction';
import { UTXOSet } from './utxo';
import { TransactionObjectType } from '@src/message';

/**
 * Handles the state of the Mining Pool
 */
class MemPool {
  private txIds: Set<ObjectId> = new Set();

  async init() {
    await this.load();
    logger.debug('Mempool initialized');
  }

  /**
   * @returns all IDs from the transactions in the mempool
   */
  getTxIds(): ObjectId[] {
    return Array.from(this.txIds);
  }

  /**
   * Creates a mempool from transaction IDs
   * @param txids
   */
  async fromTxIds(txids: ObjectId[]) {
    this.txIds = new Set(txids);
    await this.save();
  }

  /**
   * save this mempool state
   */
  async save() {
    try {
      await db.put('mempool', Array.from(this.txIds));
    } catch (e) {
      logger.error('Failed to save mempool: %o', e);
    }
  }

  /**
   * load mempool state
   */
  async load() {
    if (await db.exists('mempool')) {
      try {
        const ids = await db.get('mempool');
        if (Array.isArray(ids)) {
          this.txIds = new Set(ids);
        }
      } catch (e) {
        logger.error('Failed to load mempool: %o', e);
      }
    }
  }

  async add(tx: ObjectId) {
    if (this.txIds.has(tx)) {
      return;
    }

    this.txIds.add(tx);
    await this.save();
    logger.debug(`Added tx ${tx} to mempool`);
  }

  async remove(txId: ObjectId) {
    if (this.txIds.has(txId)) {
      this.txIds.delete(txId);
      await this.save();
      logger.debug(`Removed tx ${txId} from mempool`);
    }
  }

  /**
   * on arrival of a new transaction, update the mempool if possible
   * @param tx
   * @returns true iff tx has been successfully added to the mempool
   */
  async onTransactionArrival(tx: Transaction): Promise<boolean> {
    return true;
    /* TODO */
  }

  /**
   * reorganises the mempool on blockchain fork
   * @param lca
   * @param shortFork
   * @param longFork
   */
  // mempool.ts

  // src/mempool.ts

  async reorg(lca: Block, shortFork: Chain, longFork: Chain) {
    logger.info('Mempool Reorg: Re-evaluating transactions...');

    const confirmedTxIds = new Set<string>();
    let currentBlock = longFork.tip;

    while (objectManager.id(currentBlock) !== objectManager.id(lca)) {
      if (currentBlock.txids) {
        for (const tx of currentBlock.txids) {
          confirmedTxIds.add(tx);
          this.txIds.delete(tx);
        }
      }

      if (!currentBlock.previd) break;

      try {
        const parent = (await currentBlock.loadParent()) as Block;
        if (!parent) break;
        currentBlock = parent;
      } catch (e) {
        logger.error(
          `Mempool Reorg: Failed to load parent of block ${objectManager.id(currentBlock)} on long fork`,
          e,
        );
        break;
      }
    }

    currentBlock = shortFork.tip;

    while (objectManager.id(currentBlock) !== objectManager.id(lca)) {
      if (currentBlock.txids && currentBlock.txids.length > 0) {
        const orphansToRescue = currentBlock.txids.filter((tx) => !confirmedTxIds.has(tx));

        await Promise.all(
          orphansToRescue.map(async (tx) => {
            try {
              const txData = await objectManager.get(tx);
              if (!txData) {
                logger.warn(`Mempool Reorg: Missing data for tx ${tx} during rescue.`);
                return;
              }
              const txObj = Transaction.fromNetworkObject(txData as TransactionObjectType);
              if (!txObj.isCoinbase()) {
                this.txIds.add(tx);
              }
            } catch (e) {
              logger.error(`Mempool Reorg: Error rescuing transaction ${tx}`, e);
            }
          }),
        );
      }

      if (!currentBlock.previd) break;

      try {
        const parent = (await currentBlock.loadParent()) as Block;
        if (!parent) break;
        currentBlock = parent;
      } catch (e) {
        logger.error(
          `Mempool Reorg: Failed to load parent of block ${objectManager.id(currentBlock)} on short fork`,
          e,
        );
        break;
      }
    }

    await this.save();
    logger.info(`Mempool Reorg Complete. Current size: ${this.txIds.size}`);
  }
}

export const mempool = new MemPool();
