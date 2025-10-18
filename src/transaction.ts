import { ObjectId, objectManager } from './object'
import { TransactionInputObjectType,
         TransactionObjectType,
         TransactionOutputObjectType,
         OutpointObjectType,
         SpendingTransactionObject } from './message'
import { PublicKey, Signature } from './crypto/signature'
import { ver } from './crypto/signature'
import { logger } from './logger'
import { Block } from './block'

/**
 * a class to represent a transaction output
 */
export class Output {
  /* TODO */

  static fromNetworkObject(outputMsg: TransactionOutputObjectType): Output {
    /* TODO */
    const output = new Output('', 0);
    return output;
  }

  constructor(pubkey: PublicKey, value: number) {
    /* TODO */
  }

  toNetworkObject(): TransactionOutputObjectType {
    return {
      'pubkey': '0000000000000000000000000000000000000000000000000000000000000000',
      'value':0
    }; /* TODO */
  }
}

/**
 * a class to represent a transaction outpoint
 */
export class Outpoint {
  /* TODO */
  constructor(txid: ObjectId, index: number) {
    /* TODO */
  }

  /**
   * Gets the output referenced by this outpoint
   * @returns the referenced output
   */
  async resolve(): Promise<Output> {
    /* TODO */
    return new Output('', 0);
  }

  toNetworkObject(): OutpointObjectType {
    /* TODO */
    return {
      'txid': '0000000000000000000000000000000000000000000000000000000000000000',
      'index':0
    };
  }

  toString() {
    /* TODO */
  }
}

export class Input {
  /* TODO */

  static fromNetworkObject(inputMsg: TransactionInputObjectType): Input {
    /* TODO */
    return new Input();
  }
  constructor(/* TODO */) {
    /* TODO */
  }

  toNetworkObject(): TransactionInputObjectType {
    /* TODO */
    return {
      'outpoint': {
        'txid': '0000000000000000000000000000000000000000000000000000000000000000',
        'index':0
      },
      'sig': '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
    }
  }

  /**
   * @returns this input without a signature
   */
  toUnsigned(): Input {
    /* TODO */
    return new Input();
  }
}

/**
 * a class to represent transactions
 */
export class Transaction {
  /* TODO */

  static inputsFromNetworkObject(inputMsgs: TransactionInputObjectType[]) {
    /* TODO */
  }
  static outputsFromNetworkObject(outputMsgs: TransactionOutputObjectType[]) {
    /* TODO */
  }
  static fromNetworkObject(txObj: TransactionObjectType): Transaction {
    /* TODO */
    return new Transaction();
  }
  static async byId(txid: ObjectId): Promise<Transaction> {
    /* TODO */
    return new Transaction();
  }
  constructor(/* TODO */) {
    /* TODO */
  }
  isCoinbase(): Boolean {
    /* TODO */
    return false;
  }
  async validate(idx?: number, block?: Block) {
    /* TODO */
  }
  inputsUnsigned() {
    /* TODO */
  }
  toNetworkObject(signed: boolean = true): TransactionObjectType {
    /* TODO */
    return true;
  }
  toString() {
    /* TODO */
  }
}
