import { BlockObject, BlockObjectType, TransactionObject, ObjectType, GeneralTransactionObject } from './message';
import { hash } from './crypto/hash';
import { Peer } from './peer';
import { objectManager, ObjectId, db } from './object';
import { UTXOSet } from './utxo';
import { logger } from './logger';
import { Transaction } from './transaction';
import { chainManager } from './chain';
import { Deferred } from './promise';
import { Hash } from 'crypto';

const TARGET = '0000abc000000000000000000000000000000000000000000000000000000000'; /* TODO */
const GENESIS: BlockObjectType = {
  T: '0000abc000000000000000000000000000000000000000000000000000000000',
  created: 1671062400,
  miner: 'Marabu',
  nonce: '00000000000000000000000000000000000000000000000000000000005bb0f2',
  note: 'The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers',
  previd: null,
  txids: [],
  type: 'block',
};
const GENESIS_HASH = hash(objectManager.toCanonicalString(GENESIS));
const BU = 10 ** 12;
const BLOCK_REWARD = 50 * BU;

export class BlockManager {
  /* TODO */
}

export const blockManager = new BlockManager();

/**
 * Class used to represent a block
 */
export class Block {
  readonly t : ObjectId; // the mining target. a 32-byte hexadecimal integer
  readonly created : number;
  readonly miner? : string;
  readonly nonce : string;
  readonly note? : string;
  readonly previd : ObjectId | null;
  readonly txids : ObjectId[];
  readonly type : 'block';

  constructor(
    t: ObjectId,
    created: number,
    miner: string | undefined,
    nonce: string,
    note: string | undefined,
    previd: ObjectId | null,
    txids: ObjectId[],
  ) {
    this.t = t;
    this.created = created;
    this.miner = miner;
    this.nonce = nonce;
    this.note = note;
    this.previd = previd;
    this.txids = txids;
    this.type = 'block';
  }

  /**
   * Builds a Block object from GENESIS
   * @returns the genesis block
   */
  public static async makeGenesis(): Promise<Block> {
    return new Block(
      GENESIS.T,
      GENESIS.created,
      GENESIS.miner,
      GENESIS.nonce,
      GENESIS.note,
      GENESIS.previd,
      GENESIS.txids,
    );
  }

  /**
   * Builds a block object from given BlockObject collection
   * @param object
   * @returns a Block object representing this block
   */
  public static async fromNetworkObject(object: BlockObjectType): Promise<Block> {
    let block = new Block(
      object.T,
      object.created,
      object.miner,
      object.nonce,
      object.note,
      object.previd,
      object.txids,
    );
    await block.validate();
    return block;
  }

  /**
   * Attempts to fetch the coinbase transaction from this block, throws an Error if not present
   * @returns the coinbase transaction, if present
   * @throws Error
   */
  async getCoinbase(): Promise<Transaction> {
    /* TODO */
    return new Transaction([], undefined, 0);
  }

  hash(): string {
    const blockObject = BlockObject.check({
      type: 'block',
      txids: this.txids,
      nonce: this.nonce,
      previd: this.previd,
      created: this.created,
      T: this.t,
      miner: this.miner,
      note: this.note,
    });
    const canonical = objectManager.toCanonicalString(blockObject);
    return hash(canonical);
  }

  hasPoW(): boolean {
    return this.hash() < this.t;
  }

  isGenesis(): boolean {
    return this.hash() === GENESIS_HASH;
  }

  /**
   * Attempts to get all transaction objects from their IDs referenced in this block, throws an Error if not all could be loaded
   * @returns collecetion of transaction
   * @throws Error
   */
  async getTxs(/* TODO */): Promise<Transaction[]> {
    const txs: Transaction[] = [];
    await Promise.all(
      this.txids.map(async (txid) => {
        const txObj = GeneralTransactionObject.check(await objectManager.getFromNetwork(txid));
        const tx = Transaction.fromNetworkObject(txObj);
        txs.push(tx);
      }),
    );
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
