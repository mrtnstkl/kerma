import { ObjectId, objectManager, ValidationResultType } from './object';
import {
  TransactionInputObjectType,
  TransactionObjectType,
  TransactionOutputObjectType,
  OutpointObjectType,
  SpendingTransactionObject,
  CoinbaseTransactionObjectType,
  GeneralTransactionObjectType,
  TransactionObject,
  CoinbaseTransactionObject,
  ObjectType,
  ErrorMessageType,
  BlockObject,
} from './message';
import { isValidPublicKey, PublicKey, Signature } from './crypto/signature';
import { ver } from './crypto/signature';
import { logger } from './logger';
import { Block } from './block';
import { Peer } from '@src/peer';
import { match, when } from 'runtypes';

/**
 * a class to represent a transaction output
 */
export class Output {
  readonly pubkey: PublicKey;
  readonly value: number;

  static fromNetworkObject(outputMsg: TransactionOutputObjectType): Output {
    return new Output(outputMsg.pubkey, outputMsg.value);
  }

  constructor(pubkey: PublicKey, value: number) {
    this.pubkey = pubkey;
    this.value = value;
  }

  toNetworkObject(): TransactionOutputObjectType {
    return {
      pubkey: this.pubkey,
      value: this.value,
    };
  }
}

/**
 * a class to represent a transaction outpoint
 */
export class Outpoint {
  readonly txid: ObjectId;
  readonly index: number;
  constructor(txid: ObjectId, index: number) {
    this.index = index;
    this.txid = txid;
  }

  /**
   * Gets the output referenced by this outpoint
   * @returns the referenced output
   */
  async resolve(): Promise<Output> {
    const tx = (await objectManager.get(this.txid)) as TransactionObjectType;
    if (!tx) {
      throw new Error(`UNKNOWN_OBJECT: Transaction ${this.txid} not found in database.`);
    }

    const outputData = tx.outputs[this.index];
    if (!outputData) {
      throw new Error(
        `Invalid outpoint: Index ${this.index} is out of bounds for tx ${this.txid}.`,
      );
    }

    return new Output(outputData.pubkey, outputData.value);
  }

  toNetworkObject(): OutpointObjectType {
    return {
      txid: this.txid,
      index: this.index,
    };
  }

  toString() {
    return `${this.txid}:${this.index}`;
  }

  static fromNetworkObject(obj: OutpointObjectType): Outpoint {
    return new Outpoint(obj.txid, obj.index);
  }
}

export class Input {
  outpoint: Outpoint;
  sig: string | null;

  static fromNetworkObject(inputMsg: TransactionInputObjectType): Input {
    const outpoint = Outpoint.fromNetworkObject(inputMsg.outpoint);
    return new Input(outpoint, inputMsg.sig);
  }
  constructor(outpoint: Outpoint, sig: string | null) {
    this.outpoint = outpoint;
    this.sig = sig;
  }

  toNetworkObject(): TransactionInputObjectType {
    return {
      outpoint: {
        txid: this.outpoint.txid,
        index: this.outpoint.index,
      },
      sig: this.sig,
    };
  }

  /**
   * @returns this input without a signature
   */
  toUnsigned(): Input {
    return new Input(this.outpoint, '');
  }
}

/**
 * a class to represent transactions
 */
export class Transaction {
  readonly inputs: Input[] | undefined;
  readonly outputs: Output[];
  readonly height: number | undefined;

  static inputsFromNetworkObject(inputMsgs: TransactionInputObjectType[]) {
    return inputMsgs.map((msg) => Input.fromNetworkObject(msg));
  }

  static outputsFromNetworkObject(outputMsgs: TransactionOutputObjectType[]) {
    return outputMsgs.map((msg) => Output.fromNetworkObject(msg));
  }

  static fromNetworkObject(txObj: GeneralTransactionObjectType): Transaction {
    const outputs = Transaction.outputsFromNetworkObject(txObj.outputs);

    if (TransactionObject.validate(txObj).success) {
      const inputs = Transaction.inputsFromNetworkObject((txObj as TransactionObjectType).inputs);
      return new Transaction(outputs, inputs, undefined);
    } else if (CoinbaseTransactionObject.validate(txObj).success) {
      return new Transaction(outputs, undefined, (txObj as CoinbaseTransactionObjectType).height);
    } else {
      throw new Error('Invalid Transaction object!');
    }
  }

  static async byId(txid: ObjectId): Promise<Transaction> {
    const tx = (await objectManager.get(txid)) as TransactionObjectType;
    if (!tx) {
      throw new Error(`UNKNOWN_OBJECT: Transaction ${txid} not found.`);
    }
    return Transaction.fromNetworkObject(tx);
  }

  constructor(outputs: Output[], inputs?: Input[], height?: number) {
    this.outputs = outputs;
    this.inputs = inputs;
    this.height = height;
  }

  isCoinbase(): Boolean {
    return (!this.inputs || this.inputs.length === 0) && this.height != undefined;
  }

  static async validate (object: ObjectType): Promise<ValidationResultType> {
    const ok: ValidationResultType = { success: true };
    return await match(
      when(TransactionObject, async (obj) => {
          // We're checking a regular tx, so it must have inputs
          if (!obj.inputs || obj.inputs.length === 0) {
              const error: ErrorMessageType = {
                  type: 'error',
                  msg: 'Inputs are missing.',
                  name: 'INVALID_FORMAT',
              };
              return {success: false, error};
          }

          let totalInputValue = 0;
          let totalOutputValue = 0;

          // --- Step 2c: Validate Outputs ---
          for (const output of obj.outputs) {
              if (!isValidPublicKey(output.pubkey)) {
                  const error: ErrorMessageType = {
                      type: 'error',
                      msg: `Invalid output: bad public key format ${output.pubkey}`,
                      name: 'INVALID_FORMAT'
                  };
                  return {success:false, error};
              }
              if (!Number.isInteger(output.value) || output.value < 0) {
                  const error: ErrorMessageType = {
                      type: 'error',
                      msg: `Invalid output: value must be a non-negative integer.`,
                      name: 'INVALID_FORMAT'
                  };
                  return {success:false, error};
              }
              totalOutputValue += output.value;
          }

          // --- Step 2b: Verify Signature (Preparation) ---
          // We must re-create the Transaction class to call its 'toNetworkObject(false)'
          // This is complex, but it's what's required if we do validation here.
          const txInstance = Transaction.fromNetworkObject(obj);
          const unsignedTxObject = txInstance.toNetworkObject(false);
          const canonicalString = objectManager.toCanonicalString(unsignedTxObject);

          for (const input of obj.inputs) {
              if (!(await objectManager.exists(input.outpoint.txid))) {
                  const error: ErrorMessageType = {
                      type: 'error',
                      msg: `Referenced txid not found: ${input.outpoint.txid}`,
                      name: 'UNKNOWN_OBJECT',
                  };
                  return { success: false, error };
              } else {
                  let referencedTx: ObjectType = await objectManager.get(input.outpoint.txid);
                  const referencedOutput = (referencedTx as TransactionObjectType).outputs[input.outpoint.index];
                  if(!referencedOutput){
                      const error: ErrorMessageType = {
                          type: 'error',
                          msg: `Invalid outpoint: Index ${input.outpoint.index} is out of bounds for tx ${input.outpoint.txid}.`,
                          name: 'INVALID_FORMAT',
                      };
                      return { success: false, error };
                  }
                  totalInputValue += referencedOutput.value;
                  // --- Step 2b: Verify Signature ---
                  const { sig } = input;
                  const { pubkey } = referencedOutput;

                  if (!sig || sig === '') {
                      const error: ErrorMessageType = {
                          type: 'error',
                          msg: `Input signature is missing for ${input.outpoint.txid}:${input.outpoint.index}`,
                          name: 'INVALID_FORMAT',
                      };
                      return { success: false, error };
                  }
                  if (!(await ver(canonicalString, sig, pubkey))) {
                      const error: ErrorMessageType = {
                          type: 'error',
                          msg: `Invalid signature for input ${input.outpoint.txid}:${input.outpoint.index}`,
                          name: 'INVALID_FORMAT',
                      };
                      return { success: false, error };
                  }
              }

              // --- Step 2d: Weak Law of Conservation ---
              if (totalInputValue < totalOutputValue) {
                  const error: ErrorMessageType = {
                      type: 'error',
                      msg: `Weak law of conservation violated: Input sum (${totalInputValue}) < Output sum (${totalOutputValue}).`,
                      name: 'INVALID_FORMAT',
                  };
                  return { success: false, error };
              }
          }
        return ok;
      }),

      when(CoinbaseTransactionObject, async (obj) => {
        for (const output of obj.outputs) {
          if (!isValidPublicKey(output.pubkey)) {
            const error: ErrorMessageType = {
              type: 'error',
              msg: `Invalid output: bad public key format ${output.pubkey}`,
              name: 'INVALID_FORMAT',
            };
            return { success: false, error };
          }
          if (!Number.isInteger(output.value) || output.value < 0) {
            // This is the check your test is looking for
            const error: ErrorMessageType = {
              type: 'error',
              msg: `Invalid output: value must be a non-negative integer.`,
              name: 'INVALID_FORMAT',
            };
            return { success: false, error };
          }
        }
        return ok;
      }),

      when(BlockObject, async (obj) => {
        // todo: for assignment 2, only transaction objects are valid
        const error: ErrorMessageType = {
          type: 'error',
          msg: 'Invalid object received',
          name: 'INVALID_FORMAT',
        };
        return { success: false, error };
      }),
    )(object);
  }

  inputsUnsigned(): Input[] {
    if (!this.inputs) {
      return [];
    }
    return this.inputs.map((input) => input.toUnsigned());
  }

  toNetworkObject(signed: boolean = true): GeneralTransactionObjectType {
    const outputs = this.outputs.map((output) => output.toNetworkObject());

    const inputs = signed
      ? this.inputs?.map((input) => input.toNetworkObject())
      : this.inputsUnsigned().map((input) => input.toNetworkObject());

    if ((!this.inputs || this.inputs.length === 0) && this.height != undefined) {
      return {
        type: 'transaction',
        height: this.height,
        outputs: outputs,
      };
    } else if (inputs != undefined) {
      return {
        type: 'transaction',
        inputs: inputs,
        outputs: outputs,
      };
    } else {
      throw new Error('Invalid format of transaction network object');
    }
  }

  toString() {
    return `Transaction(${this.isCoinbase() ? 'COINBASE' : 'REGULAR'} | ${this.outputs.length} outputs)`;
  }
}
