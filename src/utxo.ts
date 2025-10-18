import { Block } from './block'
import { logger } from './logger'
import { OutpointObject, OutpointObjectType } from './message'
import { db, ObjectId } from './object'
import { Outpoint, Transaction } from './transaction'

export type UTXO = Set<string>

/**
 * a class to represent the UTXO (unspent transaction output) set
 */
export class UTXOSet {
  /* TODO */

  constructor(outpoints: UTXO) {
    /* TODO */
  }
  copy() {
    /* TODO */
  }

  /**
   * Applies the transaction on the current utxo set, throwing an error if this is not possible
   * @param tx 
   * @throws Error
   */
  async apply(tx: Transaction) {
    /* TODO */
  }

  /**
   * Applies multiple transaction to the current utxo set
   * @throws Error
   */
  async applyMultiple(txs: Transaction[]) {
    /* TODO */
  }
  
  toString() {
    /* TODO */
  }
}
