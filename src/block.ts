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
import assert from 'assert';

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
const GENESIS_HASH = '00002fa163c7dab0991544424b9fd302bb1782b185e5a3bbdf12afb758e57dee';
const BU = 10 ** 12;
const BLOCK_REWARD = 50 * BU;

export class BlockManager {
  async get(blockid: ObjectId): Promise<Block> {
    const block = BlockObject.check(await objectManager.get(blockid));
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
      height: block.meta.height,
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

  getCoinbaseTransactions(
    transactions: Transaction[],
  ): { transaction: Transaction; index: number }[] {
    const coinbaseTxs: { transaction: Transaction; index: number }[] = [];
    for (const tx of transactions) {
      if (tx.isCoinbase()) {
        coinbaseTxs.push({
          transaction: tx,
          index: transactions.indexOf(tx),
        });
      }
    }
    return coinbaseTxs;
  }

  hash(): string {
    const blockObject = BlockObject.check({
      T: this.t,
      created: this.created,
      miner: this.miner,
      nonce: this.nonce,
      note: this.note,
      previd: this.previd,
      txids: this.txids,
      type: 'block',
    });
    return objectManager.id(blockObject);
  }

  hasPoW(): boolean {
    return this.hash() < this.t;
  }

  isGenesis(): boolean {
    return this.previd === null;
  }

  /**
   * Attempts to get all transaction objects from their IDs referenced in this block, throws an Error if not all could be loaded
   * @returns collecetion of transaction
   * @throws Error
   */
  async getTxs(): Promise<{ txid: string; tx: Transaction }[]> {
    const results: { txid: string; tx: Transaction }[] = [];

    await Promise.all(
      this.txids.map(async (txid) => {
        const txObjFromNetwork = await objectManager.getFromNetwork(txid);
        try {
          const txObj = GeneralTransactionObject.check(txObjFromNetwork);
          const tx = Transaction.fromNetworkObject(txObj);
          results.push({ txid, tx });
        } catch (e) {
          throw new Error('INVALID_FORMAT error during transaction fetching');
        }
      }),
    );
    return results;
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

    if (!this.hasPoW()) {
      return {
        success: false,
        error: {
          type: 'error',
          name: 'INVALID_BLOCK_POW',
          msg: `Block ${this.hash()} does not meet protocol difficulty`,
        },
      };
    }

    if (this.isGenesis()) {
      if (this.hash() !== GENESIS_HASH) {
        return {
          success: false,
          error: {
            type: 'error',
            name: 'INVALID_GENESIS',
            msg: 'Block other than genesis block with previd set to null',
          },
        };
      }

      this.meta.verified = true;
      return { success: true };
    }

    let transactions: { tx: Transaction; txid: string }[];
    try {
      transactions = await this.getTxs();
    } catch (e) {
      if (e instanceof Error && e.message == 'INVALID_FORMAT error during transaction fetching') {
        return {
          success: false,
          error: {
            type: 'error',
            name: 'INVALID_FORMAT',
            msg: `One or more transactions had invalid format: Message: ${e.message}`,
          },
        };
      }
      return {
        success: false,
        error: {
          type: 'error',
          name: 'UNFINDABLE_OBJECT',
          msg: 'Could not get all transactions',
        },
      };
    }

    let previousBlock: Block;

    try {
      previousBlock = await blockManager.get(this.previd!);
    } catch {
      return {
        success: false,
        error: {
          type: 'error',
          name: 'UNFINDABLE_OBJECT',
          msg: `Could not find previous block.`,
        },
      };
    }

    if (this.created <= previousBlock.created) {
      return {
        success: false,
        error: {
          type: 'error',
          name: 'INVALID_BLOCK_TIMESTAMP',
          msg: 'Block timestamp must be greater than parent timestamp',
        },
      };
    }

    // Exactly 0 or 1 coinbase transactions allowed
    const coinbaseTransactions = this.getCoinbaseTransactions(transactions.map((tx) => tx.tx));
    if (coinbaseTransactions.length > 1) {
      return {
        success: false,
        error: {
          type: 'error',
          name: 'INVALID_BLOCK_COINBASE',
          msg: `Block ${this.hash()} has more than one Coinbase transaction`,
        },
      };
    }

    // If coinbase exists, it must be at index 0
    if (coinbaseTransactions.length === 1) {
      const coinbaseTx = coinbaseTransactions[0].transaction;
      if (coinbaseTx.height != this.meta.height) {
        return {
          success: false,
          error: {
            type: 'error',
            name: 'INVALID_BLOCK_COINBASE',
            msg: `Coinbase height ${coinbaseTx.height} matches block height ${this.meta.height}`,
          },
        };
      } else if (coinbaseTransactions[0].index !== 0) {
        return {
          success: false,
          error: {
            type: 'error',
            name: 'INVALID_BLOCK_COINBASE',
            msg: `Block ${this.hash()} contains coinbase transaction at index ${coinbaseTransactions[0].index}, expected 0`,
          },
        };
      }
    }

    //Check that no transaction spends from an in-block coinbase transaction
    if (coinbaseTransactions.length === 1) {
      const coinbaseTxid = this.txids[0]; // guaranteed true by earlier check

      for (const { txid, tx } of transactions) {
        if (txid === coinbaseTxid) continue; // skip coinbase itself

        for (const input of tx.inputs ?? []) {
          if (input.outpoint?.txid === coinbaseTxid) {
            return {
              success: false,
              error: {
                type: 'error',
                name: 'INVALID_TX_OUTPOINT',
                msg: `Transaction ${txid} spends from in-block coinbase ${coinbaseTxid}`,
              },
            };
          }
        }
      }
    }

    let totalFees: number;

    // Verify law of conservation for the coinbase transaction.
    //
    // This assumes all previous validation steps were performed correctly.
    try {
      totalFees = await Block.calculateFees(transactions.map((tx) => tx.tx).slice(1));
    } catch (e) {
      // Analyze if it's the case, and replace it with throwing an error
      assert(false, 'All validation should happen before');
    }

    if (transactions[0].tx.outputs[0].value > totalFees + BLOCK_REWARD) {
      return {
        success: false,
        error: {
          type: 'error',
          name: 'INVALID_BLOCK_COINBASE',
          msg: 'Coinbase transaction in the block creates more coins than allowed.',
        },
      };
    }

    const utxoSet = previousBlock.meta.utxoSet.copy();
    try {
      await utxoSet.applyMultiple(
        transactions.map((transaction) => {
          return transaction.tx;
        }),
      );
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

    return { success: true };
  }

  static async calculateFees(transactions: Transaction[]): Promise<number> {
    const fees = await Promise.all(transactions.map((tx) => tx.getFee()));

    return fees.reduce((total, fee) => total + fee, 0);
  }
}
