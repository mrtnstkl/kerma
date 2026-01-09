import { Block } from "./block";
import { logger } from "./logger";
import { mempool } from "./mempool";
import { db, objectManager } from "./object";

/**
 * Handles the blockchain state
 */
class ChainManager {
  longestChainHeight: number = 0
  longestChainTip: Block | null = null

  async init() {
    let tip, height, inited = false

    try {
      [tip, height] = await db.get('longestchain')
      logger.debug(`Retrieved cached longest chain tip ${tip.blockid} at height ${height}.`)
    }
    catch {
      tip = await Block.makeGenesis()
      height = 0
      logger.debug(`No cached longest chain exists. Initializing to genesis ${tip.blockid} at height ${height}.`)
      inited = true
    }
    this.longestChainTip = await Block.fromNetworkObject(tip)
    this.longestChainHeight = height
    if (inited) {
      await this.save()
    }
    logger.debug(`Chain manager initialized.`)
  }
  async save() {
    await db.put('longestchain', [this.longestChainTip, this.longestChainHeight])
  }
  async onValidBlockArrival(block: Block) {
    if (!block.valid) {
      throw new Error(`Received onValidBlockArrival() call for invalid block ${block.blockid}`)
    }
    const height = block.height

    if (this.longestChainTip === null) {
      throw new Error('We do not have a local chain to compare against')
    }
    if (height === undefined) {
      throw new Error(`We received a block ${block.blockid} we thought was valid, but had no calculated height.`)
    }
    if (height > this.longestChainHeight) {
      logger.debug(`New longest chain has height ${height} and tip ${block.blockid}`)
      this.longestChainHeight = height
      this.longestChainTip = block

      // reorg mempool
      const [lca, shortFork, longFork] = await Chain.getForks(this.longestChainTip, block)
      await mempool.reorg(lca, shortFork, longFork)
      await this.save()
    }
  }
}

/**
 * Represents the current block chain state as a series of blocks
 */
export class Chain {
  blocks: Block[]

  constructor(blocks: Block[]) {
    this.blocks = blocks
  }

  /**
   * Find the lowest common ancestor (LCA) in two chains
   * @param b1 a block belong to the current chain
   * @param b2 a block belonging to a new, longer chain
   * @returns [lca, lca..b1, lca..b2]
   */
  static async getForks(b1: Block, b2: Block): Promise<[Block, Chain, Chain]> {
  // todo: this is ported from the previous codebase and still untested
    let a = b1;
    let b = b2;

    while (a.height! > b.height!) {
      if (a.previd == null) break;
      a = await objectManager.get(a.previd);
    }
    while (b.height! > a.height!) {
      if (b.previd == null) break;
      b = await objectManager.get(b.previd);
    }

    while (a.T !== b.T) {
      if (a.previd == null || b.previd == null) break;
      a = await objectManager.get(a.previd);
      b = await objectManager.get(b.previd);
    }
    const lca = a;

    const shortFork: Block[] = [];
    let current = b1;
    while (current.T !== lca.T) {
      if (!current.previd) break;
      shortFork.push(current);
      current = await objectManager.get(current.previd);
    }
    shortFork.reverse();

    const longFork: Block[] = [];
    current = b2;
    while (current.T !== lca.T) {
      if (!current.previd) break;
      longFork.push(current);
      current = await objectManager.get(current.previd);
    }
    longFork.reverse();

    const shortForkChain = new Chain(shortFork);
    for (const block of shortFork.slice(1)) {
      shortForkChain.blocks.push(block);
    }

    const longForkChain = new Chain(longFork);
    for (const block of longFork.slice(1)) {
      longForkChain.blocks.push(block);
    }

    return [lca, shortForkChain, longForkChain];
  }
}

export const chainManager = new ChainManager()
