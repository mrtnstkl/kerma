import { Block, blockManager } from './block';
import { logger } from './logger';
import { mempool } from './mempool';
import { db, ObjectId } from './object';
import * as rt from 'runtypes';
import { ChainObject, ChainObjectType } from '@src/message';

/**
 * Handles the blockchain state
 */
enum Action {
  ADD = 'add',
  REMOVE = 'remove',
}

class ChainManager {
  chains: Set<ChainObjectType> = new Set<ChainObjectType>();
  private head: Block | null = null;
  async init() {
    let chainsFromDb: ChainObjectType[] = [];
    if (await db.exists('chains')) {
      try {
        chainsFromDb = rt.Array(ChainObject).check(await db.get('chains'));
        logger.info(`Loaded %d chains from database`, chainsFromDb.length);
      } catch (e) {
        logger.error(`Failed to load chains from database: %o`, e);
      }
    } else {
      logger.info(`No chains key in database`);
    }
    this.chains = new Set(chainsFromDb);
  }
  async save() {
    try {
      await db.put('chains', Array.from(this.chains));
    } catch (error) {
      logger.error(`Failed to store chains to database: %o`, error);
    }
    logger.info(`Stored %d chains to database`, this.chains.size);
  }
  async onValidBlockArrival(block: Block) {
    if (!this.head) {
      this.head = block;
      await this.updateMempoolForBlock(block, Action.ADD);
      await this.save();
      logger.info(`Genesis block initialized at height ${block.meta.height}`);

      //Duplicate Check
      if (block.t === this.head.t) {
        return;
      }

      //Chain Extension
      //New block directly extends current tip
      if (block.previd === this.head.t) {
        this.head = block;
        await this.updateMempoolForBlock(block, Action.ADD);
        logger.info(`Chain extended to height ${block.meta.height}`);
        await this.save();
        return;
      }

      //Reorganization if block claims higher height as tip
      if (block.meta.height > this.head.meta.height) {
        logger.info(`Reorg triggered: Switching from ${this.head.t} to ${block.t}`);
        const [lca, shortForkChain, longForkChain] = await Chain.getForks(this.head, block);

        if (lca) {
          // A. Rollback (Disconnect Old Chain)
          // Traverse from current Head down to LCA (exclusive)
          // Add these transactions BACK to the mempool
          let currentOld = this.head;
          while (currentOld.t !== lca.t && currentOld.previd) {
            await this.updateMempoolForBlock(currentOld, Action.REMOVE); // 'remove' from chain = add to mempool
            currentOld = await blockManager.get(currentOld.previd);
          }

          // B. Roll forward (Connect New Chain)
          // We need to apply blocks from LCA+1 up to New Tip.
          // Since chains are linked backwards, we collect them and reverse.
          const newPath: Block[] = [];
          let currentNew = block;
          while (currentNew.t !== lca.t && currentNew.previd) {
            newPath.push(currentNew);
            currentNew = await blockManager.get(currentNew.previd);
          }

          // Apply in correct order (Ascending Height)
          for (const b of newPath.reverse()) {
            await this.updateMempoolForBlock(b, Action.ADD); // 'add' to chain = remove from mempool
          }

          // Update Head
          this.head = block;
          await this.save();
          logger.info(`Reorg complete. New height: ${this.head.meta.height}`);
        }
      } else {
        // Block is valid but on a shorter or equal fork.
        // We do nothing effectively, just store it (which is handled by caller/blockManager).
        logger.info(
          `Received valid block at height ${block.meta.height}, but current chain is longer/equal (${this.head.meta.height}).`,
        );
      }
    }
  }

  async updateMempoolForBlock(block: Block, action: Action) {
    if (!block.txids) return;

    block.txids.forEach((tx) => {
      if (action === Action.ADD) {
        mempool.remove(tx);
      } else {
        // If block is removed from chain (reorg), add tx back to mempool
        mempool.add(tx);
      }
    });
  }
}

/**
 * Represents the current block chain state as a series of blocks
 */
export class Chain {
  public tip: Block;
  public height: number;

  constructor(tip: Block) {
    this.tip = tip;
    this.height = tip.meta.height;
  }

  async addBlock(block: Block) {
    this.tip = block;
    this.height += 1;
  }

  /**
   * Find the lowest common ancestor (LCA) in two chains
   * @param b1 a block belong to the current chain
   * @param b2 a block belonging to a new, longer chain
   * @returns [lca, lca..b1, lca..b2]
   */
  static async getForks(b1: Block, b2: Block): Promise<[Block, Chain, Chain]> {
    let a = b1;
    let b = b2;

    while (a.meta.height > b.meta.height) {
      if (a.previd == null) break;
      a = await blockManager.get(a.previd);
    }
    while (b.meta.height > a.meta.height) {
      if (b.previd == null) break;
      b = await blockManager.get(b.previd);
    }

    while (a.t !== b.t) {
      if (a.previd == null || b.previd == null) break;
      a = await blockManager.get(a.previd);
      b = await blockManager.get(b.previd);
    }
    const lca = a;

    const shortFork: Block[] = [];
    let current = b1;
    while (current.t !== lca.t) {
      if (!current.previd) break;
      shortFork.push(current);
      current = await blockManager.get(current.previd);
    }
    shortFork.reverse();

    const longFork: Block[] = [];
    current = b2;
    while (current.t !== lca.t) {
      if (!current.previd) break;
      longFork.push(current);
      current = await blockManager.get(current.previd);
    }
    longFork.reverse();

    const shortForkChain = new Chain(shortFork[0]);
    for (const block of shortFork.slice(1)) {
      await shortForkChain.addBlock(block);
    }

    const longForkChain = new Chain(longFork[0]);
    for (const block of longFork.slice(1)) {
      await longForkChain.addBlock(block);
    }

    return [lca, shortForkChain, longForkChain];
  }
}

export const chainManager = new ChainManager();
