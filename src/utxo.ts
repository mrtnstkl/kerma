import { Block } from './block';
import { hash } from './crypto/hash';
import { logger } from './logger';
import { OutpointObject, OutpointObjectType } from './message';
import { db, ObjectId, objectManager } from './object';
import { Outpoint, Transaction } from './transaction';

export type UTXO = Set<string>;

/**
 * a class to represent the UTXO (unspent transaction output) set
 */
export class UTXOSet {
  utxos: UTXO;

  constructor(outpoints: UTXO) {
    this.utxos = new Set(outpoints);
  }
  copy() {
    return new UTXOSet(new Set(this.utxos));
  }

  /**
   * Applies the transaction on the current utxo set, throwing an error if this is not possible
   * @param tx
   * @throws Error
   */
  async apply(tx: Transaction) {
    const workingUtxoSet = new Set(this.utxos);
    if (!tx.isCoinbase()) {
      for (const input of tx.inputs!) {
        if (!workingUtxoSet.delete(`${input.outpoint.txid}:${input.outpoint.index}`))
          throw new Error(`UTXOSet apply: trying to spend non-existing outpoint ${input.outpoint.txid}:${input.outpoint.index}`);
      }
    }
    const txid = hash(objectManager.toCanonicalString(tx));
    tx.outputs.forEach((output, index) => {
      workingUtxoSet.add(`${txid}:${index}`);
    });
    this.utxos = workingUtxoSet;
  }

  /**
   * Applies multiple transaction to the current utxo set
   * @throws Error
   */
  async applyMultiple(txs: Transaction[]) {
    const workingCopy = this.copy();
    for (const tx of txs) {
      await workingCopy.apply(tx);
    }
    this.utxos = workingCopy.utxos;
  }

  toString() {
    return Array.from(this.utxos).toString();
  }

  toArray(): string[] {
    return Array.from(this.utxos);
  }
}
