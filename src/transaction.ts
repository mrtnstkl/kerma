import { ObjectId, objectManager } from './object';
import {
  TransactionInputObjectType,
  TransactionObjectType,
  TransactionOutputObjectType,
  OutpointObjectType,
  SpendingTransactionObject,
  CoinbaseTransactionObjectType,
  GeneralTransactionObjectType,
  TransactionObject, CoinbaseTransactionObject,
} from './message';
import {isValidPublicKey, PublicKey, Signature} from './crypto/signature';
import { ver } from './crypto/signature';
import { logger } from './logger';
import { Block } from './block';

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

  async validate(idx?: number, block?: Block) {
    if (this.isCoinbase()) {
      await this.validateCoinbase();
    } else {
      await this.validateNonCoinbase();
    }
  }

  private validateOutputs(): number {
    let totalOutputValue = 0;
    for (const output of this.outputs) {
      if (!isValidPublicKey(output.pubkey)) {
        throw new Error(`Invalid output: bad public key format ${output.pubkey}`);
      }
      if (!Number.isInteger(output.value) || output.value < 0) {
        throw new Error(`Invalid output: value must be a non-negative integer.`);
      }
      totalOutputValue += output.value;
    }
    return totalOutputValue;
  }

  async validateCoinbase(): Promise<void> {
    //Assumption in the assignment that syntactically correct
    //coinbase transactions are always valid
    this.validateOutputs();
  }

  private async validateNonCoinbase(): Promise<void> {
    if (!this.inputs) {
      throw new Error('Invalid Non-Coinbase-Transaction: Inputs are missing.');
    }

    let totalInputValue = 0;

    // --- Step 2c: Validate Outputs ---
    // First, check all outputs and sum their value.
    const totalOutputValue = this.validateOutputs();

    const unsignedTxObject = this.toNetworkObject(false);

    const canonicalStringTxHash = objectManager.toCanonicalString(unsignedTxObject);

    // --- Loop for Steps 2a & 2b ---
    for (const input of this.inputs) {
      const referencedOutput = await input.outpoint.resolve();

      totalInputValue += referencedOutput.value;
      const pubkey = referencedOutput.pubkey;
      const signature = input.sig;

      if (!signature || signature == '') {
        throw new Error(`Input signature is null or undefined for ${input.outpoint.toString()}`);
      }

      const isSignatureValid = await ver(canonicalStringTxHash, signature, pubkey);

      if (!isSignatureValid) {
        throw new Error(`Invalid signature for input ${input.outpoint.toString()}`);
      }
    }

    // --- Weak Law of Conservation ---
    if (totalInputValue < totalOutputValue) {
      throw new Error(
        `Weak law of conservation violated: Input sum (${totalInputValue}) < Output sum (${totalOutputValue}).`,
      );
    }
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
