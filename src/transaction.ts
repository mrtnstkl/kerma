import {ObjectId, objectManager} from './object'
import {
  BlockObject,
  INVALID_FORMAT,
  INVALID_TX_CONSERVATION,
  INVALID_TX_OUTPOINT,
  INVALID_TX_SIGNATURE,
  OutpointObjectType,
  SpendingTransactionObject,
  TransactionInputObjectType, TransactionObject,
  TransactionObjectType,
  TransactionOutputObjectType, UNFINDABLE_OBJECT,
  UNKNOWN_OBJECT
} from './message'
import {PublicKey, Signature, ver} from './crypto/signature'
import {canonicalize} from 'json-canonicalize'
import {logger} from './logger'
import {Block} from './block'
import {CustomError} from './errors'
import {Peer} from "./peer";

/**
 * a class to represent a transaction output
 */
export class Output {
  pubkey: PublicKey
  value: number

  static fromNetworkObject(outputMsg: TransactionOutputObjectType): Output {
    return new Output(outputMsg.pubkey, outputMsg.value)
  }
  constructor(pubkey: PublicKey, value: number) {
    this.pubkey = pubkey
    this.value = value
  }
  toNetworkObject(): TransactionOutputObjectType {
    return {
      pubkey: this.pubkey,
      value: this.value
    }
  }
}

/**
 * a class to represent a transaction outpoint
 */
export class Outpoint {
  txid: ObjectId
  index: number

  static fromNetworkObject(outpoint: OutpointObjectType): Outpoint {
    return new Outpoint(outpoint.txid, outpoint.index)
  }
  constructor(txid: ObjectId, index: number) {
    this.txid = txid
    this.index = index
  }
  async resolve(): Promise<Output> {
    let refTxMsg
    try {
      refTxMsg = await objectManager.retrieve(this.txid)
    }
    catch (e) {
      throw new CustomError(`Failed to receive dependent transaction`, UNFINDABLE_OBJECT, true)
    }
    if (!TransactionObject.guard(refTxMsg)) {
      throw new CustomError(`Got an object back for ${this.txid}; but this is not a transaction`, INVALID_FORMAT)
    }

    const refTx = Transaction.fromNetworkObject(refTxMsg)

    if (this.index >= refTx.outputs.length) {
      throw new CustomError(`Invalid index reference ${this.index} for transaction ${this.txid}. The transaction only has ${refTx.outputs.length} outputs.`, INVALID_TX_OUTPOINT)
    }
    return refTx.outputs[this.index]
  }
  toNetworkObject(): OutpointObjectType {
    return {
      txid: this.txid,
      index: this.index
    }
  }
  toString() {
    return `<outpoint: (${this.txid}, ${this.index})>`
  }
  equals(obj: Outpoint) {
    return obj.txid == this.txid && obj.index == this.index
  }
}

export class Input {
  outpoint: Outpoint
  sig: Signature | null

  static fromNetworkObject(inputMsg: TransactionInputObjectType): Input {
    return new Input(
        Outpoint.fromNetworkObject(inputMsg.outpoint),
        inputMsg.sig
    )
  }
  constructor(outpoint: Outpoint, sig: Signature | null = null) {
    this.outpoint = outpoint
    this.sig = sig
  }
  toNetworkObject(): TransactionInputObjectType {
    return {
      outpoint: this.outpoint.toNetworkObject(),
      sig: this.sig
    }
  }
  toUnsigned(): Input {
    return new Input(this.outpoint)
  }
}

/**
 * a class to represent transactions
 */
export class Transaction {
  txid: ObjectId
  inputs: Input[] = []
  outputs: Output[] = []
  height: number | null = null
  fees: number | undefined

  static inputsFromNetworkObject(inputMsgs: TransactionInputObjectType[]) {
    return inputMsgs.map(Input.fromNetworkObject)
  }
  static outputsFromNetworkObject(outputMsgs: TransactionOutputObjectType[]) {
    return outputMsgs.map(Output.fromNetworkObject)
  }
  static fromNetworkObject(txObj: TransactionObjectType): Transaction {
    let inputs: Input[] = []
    let height: number | null = null

    if (SpendingTransactionObject.guard(txObj)) {
      inputs = Transaction.inputsFromNetworkObject(txObj.inputs)
    }
    else {
      height = txObj.height
    }
    const outputs = Transaction.outputsFromNetworkObject(txObj.outputs)

    return new Transaction(objectManager.id(txObj), inputs, outputs, height)
  }
  static async byId(txid: ObjectId): Promise<Transaction> {
    return this.fromNetworkObject(await objectManager.get(txid))
  }
  constructor(txid: ObjectId, inputs: Input[], outputs: Output[], height: number | null = null) {
    this.txid = txid
    this.inputs = inputs
    this.outputs = outputs
    this.height = height
  }
  isCoinbase() {
    return this.inputs.length === 0
  }
  async validate() {
    logger.debug(`Validating transaction ${this.txid}`)
    const unsignedTxStr = canonicalize(this.toNetworkObject(false))

    if (this.isCoinbase()) {
      if (this.outputs.length > 1) {
        throw new CustomError(`Invalid coinbase transaction ${this.txid}. Coinbase must have only a single output.`, INVALID_FORMAT)
      }
      this.fees = 0
      return
    }

    let blockCoinbase: Transaction

    const inputValues = await Promise.all(
        this.inputs.map(async (input, i) => {
          const prevOutput = await input.outpoint.resolve()

          if (input.sig === null) {
            throw new CustomError(`No signature available for input ${i} of transaction ${this.txid}`, INVALID_FORMAT)
          }
          if (!await ver(input.sig, unsignedTxStr, prevOutput.pubkey)) {
            throw new CustomError(`Signature validation failed for input ${i} of transaction ${this.txid}`, INVALID_TX_SIGNATURE)
          }

          return prevOutput.value
        })
    )

    // check that no output was used twice
    for(let i1 = 0; i1 < this.inputs.length; i1 ++)
    {
      for(let i2 = i1 + 1; i2 < this.inputs.length; i2 ++)
      {
        const o1 = this.inputs[i1].outpoint
        const o2 = this.inputs[i2].outpoint

        if(o1.equals(o2))
          throw new CustomError(`Transaction spends twice from same output ${o1.toString()} at input ${i1} and ${i2}`, INVALID_TX_CONSERVATION)
      }
    }

    let sumInputs = 0
    let sumOutputs = 0

    logger.debug(`Checking the law of conservation for transaction ${this.txid}`)
    for (const inputValue of inputValues) {
      sumInputs += inputValue
    }
    logger.debug(`Sum of inputs is ${sumInputs}`)
    for (const output of this.outputs) {
      sumOutputs += output.value
    }
    logger.debug(`Sum of outputs is ${sumOutputs}`)
    if (sumInputs < sumOutputs) {
      throw new CustomError(`Transaction ${this.txid} does not respect the Law of Conservation. Inputs summed to ${sumInputs}, while outputs summed to ${sumOutputs}.`, INVALID_TX_CONSERVATION)
    }
    this.fees = sumInputs - sumOutputs
    logger.debug(`Transaction ${this.txid} pays fees ${this.fees}`)
    logger.debug(`Transaction ${this.txid} is valid`)
  }
  inputsUnsigned() {
    return this.inputs.map(
        input => input.toUnsigned().toNetworkObject()
    )
  }
  toNetworkObject(signed: boolean = true): TransactionObjectType {
    const outputObjs = this.outputs.map(output => output.toNetworkObject())

    if (this.height !== null) {
      // coinbase
      return {
        type: 'transaction',
        outputs: outputObjs,
        height: this.height
      }
    }
    if (signed) {
      return {
        type: 'transaction',
        inputs: this.inputs.map(input => input.toNetworkObject()),
        outputs: outputObjs
      }
    }
    return {
      type: 'transaction',
      inputs: this.inputsUnsigned(),
      outputs: outputObjs
    }
  }
  toString() {
    return `<Transaction ${this.txid}>`
  }
}
