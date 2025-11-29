import {
  BlockObject,
  BlockObjectType,
  TransactionObject,
  ObjectType,
  GeneralTransactionObject,
  CoinbaseTransactionObject,
} from './message';
import { hash } from './crypto/hash';
import { Peer } from './peer';
import { objectManager, ObjectId, db, ValidationResult, ValidationResultType } from './object';
import { UTXOSet } from './utxo';
import { logger } from './logger';
import { Transaction } from './transaction';
import { chainManager } from './chain';
import { Deferred } from './promise';
import { Hash } from 'crypto';
import { error } from 'winston';
import { Array, Boolean, Number, Record, Static, String } from 'runtypes';

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
  async get(blockid: ObjectId): Promise<Block> {
    const block = BlockObject.check(objectManager.get(blockid));
    let meta;
    if (await db.exists(`object:${blockid}:meta`)) {
      meta = BlockMetaObject.check(await db.get(`object:${blockid}:meta`));
    }
    return await Block.fromNetworkObject(block, meta);
  }

  async del(blockid: ObjectId) {
    if (BlockObject.validate(objectManager.get(blockid)).success) {
      await objectManager.del(blockid);
      await db.del(`object:${blockid}:meta`);
    } else {
      throw new Error(`${blockid} is not a block object`);
    }
  }

  async exists(blockid: ObjectId) {
    if (!(await objectManager.exists(blockid))) return false;
    return BlockObject.validate(objectManager.get(blockid)).success;
  }

  async put(block: Block): Promise<ObjectId> {
    const blockObj = BlockObject.check({
      type: 'block',
      txids: block.txids,
      nonce: block.nonce,
      previd: block.previd,
      created: block.created,
      T: block.t,
      miner: block.miner,
      note: block.note,
    });
    const blockid = objectManager.put(blockObj);
    const blockMetaObj = BlockMetaObject.check({
      verified: block.meta.verified,
      utxoSet: block.meta.utxoSet.toArray(),
    });
    await db.put(`object:${blockid}:meta`, blockMetaObj);
    return blockid;
  }
}

export const blockManager = new BlockManager();

export class BlockMeta {
  verified: boolean;
  utxoSet: UTXOSet;
  height: number;

  constructor(verified: boolean = false, height: number, utxoSet?: UTXOSet) {
    this.verified = verified;
    this.height = height;
    this.utxoSet = utxoSet ?? new UTXOSet(new Set());
  }
  static fromObject(obj: BlockMetaObjectType): BlockMeta {
    return new BlockMeta(obj.verified, obj.height, new UTXOSet(new Set(obj.utxoSet)));
  }
}

const BlockMetaObject = Record({
  verified: Boolean,
  height: Number,
  utxoSet: Array(String),
});
type BlockMetaObjectType = Static<typeof BlockMetaObject>;

/**
 * Class used to represent a block
 */
export class Block {
  readonly t: ObjectId; // the mining target. a 32-byte hexadecimal integer
  readonly created: number;
  readonly miner?: string;
  readonly nonce: string;
  readonly note?: string;
  readonly previd: ObjectId | null;
  readonly txids: ObjectId[];

  meta: BlockMeta = new BlockMeta(false, 0);

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
  }

  /**
   * Builds a Block object from GENESIS
   * @returns the genesis block
   */
  public static async makeGenesis(): Promise<Block> {
    const block = await Block.fromNetworkObject(GENESIS);
    block.meta.verified = true;
    block.meta.height = 0;
    // utxo set remains empty, since our genesis block has no transactions
    return block;
  }

  /**
   * Builds a block object from given BlockObject collection
   * @param object
   * @returns a Block object representing this block
   */
  public static async fromNetworkObject(
    object: BlockObjectType,
    meta?: BlockMetaObjectType,
  ): Promise<Block> {
    let block = new Block(
      object.T,
      object.created,
      object.miner,
      object.nonce,
      object.note,
      object.previd,
      object.txids,
    );
    block.meta = meta ? BlockMeta.fromObject(meta) : new BlockMeta(false, 0);
    return block;
  }

  /**
   * Attempts to fetch the coinbase transaction from this block, throws an Error if not present
   * @returns the coinbase transaction, if present
   * @throws Error
   */
  async getCoinbase(): Promise<Transaction> {
    // coinbase is always the first transaction
    if (this.txids.length === 0) {
      throw new Error(`Block ${this.hash()} has no transactions, cannot get coinbase`);
    }
    const firstTxId = this.txids[0];
    const txObj = CoinbaseTransactionObject.check(await objectManager.getFromNetwork(firstTxId));
    return Transaction.fromNetworkObject(txObj);
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
    if (this.previd === null) {
      return null;
    }
    const parentObj = BlockObject.check(await objectManager.getFromNetwork(this.previd));
    return await Block.fromNetworkObject(parentObj);
  }

  /**
   * Validates the ancestry of this block until a block that has already been verified is hit
   * @returns parent Block if valid, otherwise null
   */
  async validateAncestry(): Promise<Block | null> {
    /* TODO */
    return null;
  }

  /**
   * Validate this block, throwing an error if validation failed
   */
  async validate(): Promise<ValidationResultType> {
    this.meta.verified = false;

    const transactions = await this.getTxs();
    const utxoSet = new UTXOSet(new Set());
    try {
      await utxoSet.applyMultiple(transactions);
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'error',
          name: 'INVALID_TX_CONSERVATION',
          msg: `Block ${this.hash()} violates transaction conservation: ${error}`,
        },
      };
    }
    this.meta.utxoSet = utxoSet;

    if (this.isGenesis()) {
      this.meta.verified = true;
      return { success: true };
    }

    if (this.t !== TARGET) {
      return {
        success: false,
        error: {
          type: 'error',
          name: 'INVALID_FORMAT',
          msg: `Block target ${this.t} does not match expected target ${TARGET}`,
        },
      };
    }

    return { success: true };
  }
}
