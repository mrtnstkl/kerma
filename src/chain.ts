import { Block, blockManager } from './block';
import { logger } from './logger';
import { mempool } from './mempool';
import { db, ObjectId, objectManager } from './object';
import * as rt from 'runtypes';
import { ChainObject, ChainObjectType } from './message';

/**
 * Handles the blockchain state
 */
enum Action {
  ADD = 'add',
  REMOVE = 'remove',
}

class ChainManager {
  chains: Set<ChainObjectType> = new Set<ChainObjectType>();
  head: Block | null = null;
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
    const blockId = objectManager.id(block);
    const headId = this.head ? objectManager.id(this.head) : null;

    if (!this.head) {
      this.head = block;
      await this.updateMempoolForBlock(block, Action.ADD);
      await this.save();
      logger.info(`Genesis block initialized at height ${block.meta.height}`);
      return;
    }

    if (blockId === headId) {
      return;
    }

    if (block.previd === headId) {
      this.head = block;
      await this.updateMempoolForBlock(block, Action.ADD);
      logger.info(`Chain extended to height ${block.meta.height}`);
      await this.save();
      return;
    }

    if (block.meta.height > this.head.meta.height) {
      logger.info(`Reorg triggered: Switching to new tip ${blockId}`);

      const [lca, shortForkChain, longForkChain] = await Chain.getForks(
        this.head,
        block,
      );

      if (lca) {
        await mempool.reorg(lca, shortForkChain, longForkChain);
        this.head = block;
        await this.save();
      }
    }
  }

  async updateMempoolForBlock(block: Block, action: Action) {
    if (!block.txids) return;

    block.txids.forEach((tx) => {
      if (action === Action.ADD) {
        mempool.remove(tx);
      } else {
        mempool.add(tx);
      }
    });
  }
}

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

  static async getForks(b1: Block, b2: Block): Promise<[Block, Chain, Chain]> {
    let a = b1;
    let b = b2;

    while (a.meta.height > b.meta.height) {
      const p = await a.loadParent();
      if (!p) break;
      a = p;
    }
    while (b.meta.height > a.meta.height) {
      const p = await b.loadParent();
      if (!p) break;
      b = p;
    }

    while (objectManager.id(a) !== objectManager.id(b)) {
      const pa = await a.loadParent();
      const pb = await b.loadParent();
      if (!pa || !pb) break;
      a = pa;
      b = pb;
    }
    const lca = a;

    const shortFork: Block[] = [];
    let current = b1;
    while (objectManager.id(current) !== objectManager.id(lca)) {
      if (!current.previd) break;
      shortFork.push(current);
      const p = await current.loadParent();
      if (!p) break;
      current = p;
    }
    shortFork.reverse();

    const longFork: Block[] = [];
    current = b2;
    while (objectManager.id(current) !== objectManager.id(lca)) {
      if (!current.previd) break;
      longFork.push(current);
      const p = await current.loadParent();
      if (!p) break;
      current = p;
    }
    longFork.reverse();

    const shortForkTip = shortFork.length > 0 ? shortFork[0] : lca;
    const shortForkChain = new Chain(shortForkTip);
    for (const block of shortFork.slice(1)) {
      await shortForkChain.addBlock(block);
    }

    const longForkTip = longFork.length > 0 ? longFork[0] : lca;
    const longForkChain = new Chain(longForkTip);
    for (const block of longFork.slice(1)) {
      await longForkChain.addBlock(block);
    }

    return [lca, shortForkChain, longForkChain];
  }
}

export const chainManager = new ChainManager();