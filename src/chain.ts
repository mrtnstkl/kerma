import { Block, blockManager } from './block';
import { logger } from './logger';
import { mempool } from './mempool';
import { db, ObjectId } from './object';
import * as rt from 'runtypes';
import { ChainObject, ChainObjectType } from '@src/message';

/**
 * Handles the blockchain state
 */
class ChainManager {
  chains: Set<ChainObjectType> = new Set<ChainObjectType>();
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
    /* TODO */
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
