import { ObjectId, objectManager } from './object';
import {
  TransactionInputObjectType,
  TransactionObjectType,
  TransactionOutputObjectType,
  OutpointObjectType,
  SpendingTransactionObject,
} from './message';
import { PublicKey, Signature } from './crypto/signature';
import { ver } from './crypto/signature';
import { logger } from './logger';
import { Block } from './block';

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
      pubkey: '0000000000000000000000000000000000000000000000000000000000000000',
      value: 0,
    }; /* TODO */
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
    readonly height?: number | undefined;

    static inputsFromNetworkObject(inputMsgs: TransactionInputObjectType[]) {
        return inputMsgs.map((msg) => Input.fromNetworkObject(msg));
    }
    static outputsFromNetworkObject(outputMsgs: TransactionOutputObjectType[]) {
        return outputMsgs.map((msg) => Output.fromNetworkObject(msg));
    }
    static fromNetworkObject(txObj: TransactionObjectType): Transaction {
        const outputs = Transaction.outputsFromNetworkObject(txObj.outputs);

        if (txObj.inputs) {
            const inputs = Transaction.inputsFromNetworkObject(txObj.inputs);
            return new Transaction(outputs, inputs, undefined);
        }
        //TODO: differ coinbase transaction
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
        return !this.inputs || this.inputs.length === 0;
    }
    async validate(idx?: number, block?: Block) {
        /* TODO */
    }
    inputsUnsigned(): Input[] {
        if (!this.inputs) {
            return [];
        }
        return this.inputs.map((input) => input.toUnsigned());
    }
    toNetworkObject(signed: boolean = true): TransactionObjectType {
        const outputs = this.outputs.map((output) => output.toNetworkObject());

        if (this.isCoinbase()) {
            return {
                type: 'transaction',
                height: this.height,
                outputs: outputs,
            };
        }

        const inputs = signed
            ? this.inputs?.map((input) => input.toNetworkObject())
            : this.inputsUnsigned().map((input) => input.toNetworkObject());

        return {
            type: 'transaction',
            inputs: inputs,
            outputs: outputs,
        };
    }
    toString() {
        return `Transaction(${this.isCoinbase() ? 'COINBASE' : 'REGULAR'} | ${this.outputs.length} outputs)`;
    }
}
