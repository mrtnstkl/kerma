import { BlockObject, BlockObjectType,
         TransactionObject, ObjectType } from './message'
import { hash } from './crypto/hash'
import { Peer } from './peer'
import { objectManager, ObjectId, db } from './object'
import { UTXOSet } from './utxo'
import { logger } from './logger'
import { Transaction } from './transaction'
import { chainManager } from './chain'
import { Deferred } from './promise'

const TARGET = '0000abc000000000000000000000000000000000000000000000000000000000' /* TODO */
const GENESIS: BlockObjectType = {
  "T":"0000abc000000000000000000000000000000000000000000000000000000000",
  "created":1671062400,
  "miner":"Marabu",
  "nonce":"00000000000000000000000000000000000000000000000000000000005bb0f2",
  "note":"The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers",
  "previd": null,
  "txids":[],
  "type":"block"
} 
const BU = 10**12
const BLOCK_REWARD = 50 * BU

export class BlockManager {
  /* TODO */
}

export const blockManager = new BlockManager()

/**
 * Class used to represent a block
 */
export class Block {
  /* TODO */

  /**
   * Builds a Block object from GENESIS
   * @returns the genesis block
   */
  public static async makeGenesis(): Promise<Block> {
    /* TODO */
    return new Block();
  }

  /**
   * Builds a block object from given BlockObject collection
   * @param object 
   * @returns a Block object representing this block
   */
  public static async fromNetworkObject(object: BlockObjectType): Promise<Block> {
    /* TODO */
    return new Block();
  }

  constructor(
    /* TODO */
  ) {
    /* TODO */
  }

  /**
   * Attempts to fetch the coinbase transaction from this block, throws an Error if not present
   * @returns the coinbase transaction, if present
   * @throws Error
   */
  async getCoinbase(): Promise<Transaction> {
    /* TODO */
    return new Transaction();
  }

  hasPoW(): boolean {
    /* TODO */
    return false;
  }

  isGenesis(): boolean {
    /* TODO */
    return false;
  }

  /**
   * Attempts to get all transaction objects from their IDs referenced in this block, throws an Error if not all could be loaded
   * @returns collecetion of transaction
   * @throws Error
   */
  async getTxs(/* TODO */): Promise<Transaction[]> {
    /* TODO */
    const txs: Transaction[] = [];
    return txs;
  }

  /**
   * Validates a transaction, throws an Error if transaction failed to verify
   * @throws Error
   */
  async validateTx(/* TODO */) {
    /* TODO */
  }

  /**
   * Gets the parent block, returning null on failure
   * @returns Block
   */
  async loadParent(): Promise<Block | null> {
    /* TODO */
    return null;
  }

  /**
   * Validates the ancestry of this block until a block that has already been verified is hit
   * @returns parent Block if valid, otherwise null
   */
  async validateAncestry(/* TODO */): Promise<Block | null> {
    /* TODO */
    return null;
  }

  /**
   * Validate this block, throwing an error if validation failed
   * @throws Error
   */
  async validate(/* TODO */) {
    /* TODO */
  }

  /**
   * save this block (alongside meta information) in the database
   */
  async save() {
    /* TODO */
  }

  /**
   * load this block data and meta information
   */
  async load() {
    /* TODO */
  }
}
