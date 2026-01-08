import {
  BlockObject,
  BlockObjectType,
  INVALID_ANCESTRY,
  INVALID_BLOCK_COINBASE,
  INVALID_BLOCK_POW,
  INVALID_BLOCK_TIMESTAMP,
  INVALID_FORMAT,
  INVALID_GENESIS,
  INVALID_TX_OUTPOINT,
  ObjectType,
  TransactionObject,
  UNFINDABLE_OBJECT
} from './message'
import {hash} from './crypto/hash'
import {canonicalize} from 'json-canonicalize'
import {Peer} from './peer'
import {db, ObjectId, objectManager} from './object'
import util from 'util'
import {UTXOSet} from './utxo'
import {logger} from './logger'
import {Transaction} from './transaction'
import {chainManager} from './chain'
import {Deferred} from './promise'
import {CustomError} from "./errors";

const TARGET = '0000abc000000000000000000000000000000000000000000000000000000000'
const GENESIS: BlockObjectType = {
  "T":"0000abc000000000000000000000000000000000000000000000000000000000",
  "created":1671062400,
  "miner":"Marabu",
  "nonce":"00000000000000000000000000000000000000000000000000000000005bb0f2",
  "note":"The New York Times 2022-12-13: Scientists Achieve Nuclear Fusion Breakthrough With Blast of 192 Lasers",
  "previd": null,
  "txids":[],
  "type":"block"
}

const BU = 10**12
const BLOCK_REWARD = 50 * BU

export class BlockManager {
  deferredValidations: { [key: string]: Deferred<boolean> } = {}
}

export const blockManager = new BlockManager()

/**
 * Class used to represent a block
 */
export class Block {
  previd: string | null
  txids: ObjectId[]
  nonce: string
  T: string
  created: number
  miner: string | undefined
  note: string | undefined
  blockid: string
  fees: number | undefined
  stateAfter: UTXOSet | undefined
  height: number | undefined
  valid: boolean = false

  /**
   * Builds a Block object from GENESIS
   * @returns the genesis block
   */
  public static async makeGenesis(): Promise<Block> {
    const genesis = await Block.fromNetworkObject(GENESIS)
    genesis.valid = true
    genesis.stateAfter = new UTXOSet(new Set<string>())
    genesis.height = 0
    await genesis.save()

    if (!await objectManager.exists(genesis.blockid)) {
      await objectManager.put(genesis.toNetworkObject())
    }

    return genesis
  }

  /**
   * Builds a block object from given BlockObject collection
   * @param object 
   * @returns a Block object representing this block
   */
  public static async fromNetworkObject(object: BlockObjectType): Promise<Block> {
    const b = new Block(
        object.previd,
        object.txids,
        object.nonce,
        object.T,
        object.created,
        object.miner,
        object.note
    )
    // see if we can load block metadata from cache
    try {
      await b.load()
    }
    catch {} // block metadata not cached
    return b
  }

  constructor(
    previd: string | null,
    txids: string[],
    nonce: string,
    T: string,
    created: number,
    miner: string | undefined,
    note: string | undefined
  ) {
    this.previd = previd
    this.txids = txids
    this.nonce = nonce
    this.T = T
    this.created = created
    this.miner = miner
    this.note = note
    this.blockid = hash(canonicalize(this.toNetworkObject()))
  }

  /**
   * Attempts to fetch the coinbase transaction from this block, throws an Error if not present
   * @returns the coinbase transaction, if present
   * @throws Error
   */
  async getCoinbase(): Promise<Transaction> {
    if (this.txids.length === 0)  {
      throw new Error('The block has no coinbase transaction')
    }
    const txid = this.txids[0]
    logger.debug(`Checking whether ${txid} is the coinbase`)
    const obj = await objectManager.get(txid)

    if (!TransactionObject.guard(obj)) {
      throw new Error('The block contains non-transaction txids')
    }

    const tx: Transaction = Transaction.fromNetworkObject(obj)

    if (tx.isCoinbase()) {
      return tx
    }
    throw new Error('The block has no coinbase transaction')
  }
  toNetworkObject() {
    const netObj: BlockObjectType = {
      type: 'block',
      previd: this.previd,
      txids: this.txids,
      nonce: this.nonce,
      T: this.T,
      created: this.created,
      miner: this.miner
    }

    if (this.note !== undefined) {
      netObj.note = this.note
    }
    return netObj
  }
  hasPoW(): boolean {
    return BigInt(`0x${this.blockid}`) <= BigInt(`0x${TARGET}`)
  }
  isGenesis(): boolean {
    return this.previd === null
  }

  /**
   * Attempts to get all transaction objects from their IDs referenced in this block, throws an Error if not all could be loaded
   * @returns collecetion of transaction
   * @throws Error
   */
  async getTxs(peer?: Peer): Promise<Transaction[]> {
    const txPromises: Promise<ObjectType>[] = []
    let maybeTransactions: ObjectType[] = []
    const txs: Transaction[] = []

    for (const txid of this.txids) {
        txPromises.push(objectManager.retrieve(txid))
    }
    try {
      maybeTransactions = await Promise.all(txPromises)
    }
    catch (e) {
      throw new CustomError(`Retrieval of transactions of block ${this.blockid} failed; rejecting block`, UNFINDABLE_OBJECT, true)
    }
    logger.debug(`We have all ${this.txids.length} transactions of block ${this.blockid}`)
    for (const maybeTx of maybeTransactions) {
      if (!TransactionObject.guard(maybeTx)) {
        throw new CustomError(`Block reports a transaction with id ${objectManager.id(maybeTx)}, but this is not a transaction.`, INVALID_FORMAT)
      }
      const tx = Transaction.fromNetworkObject(maybeTx)
      txs.push(tx)
    }

    return txs
  }

  /**
   * Validates a transaction, throws an Error if transaction failed to verify
   * @throws Error
   */
  async validateTx(peer: Peer, stateBefore: UTXOSet, height: number) {
    logger.debug(`Validating ${this.txids.length} transactions of block ${this.blockid}`)

    const stateAfter = stateBefore.copy()

    const txs = await this.getTxs(peer)

    for (const tx of txs) {
      await tx.validate()
    }

    await stateAfter.applyMultiple(txs, this)
    logger.debug(`UTXO state of block ${this.blockid} calculated`)

    let fees = 0
    for (const tx of txs) {
      if (tx.fees === undefined) {
        throw new Error(`Transaction fees not calculated`) // assert: false
      }
      fees += tx.fees
    }
    this.fees = fees

    let coinbase

    try {
      coinbase = await this.getCoinbase()
    }
    catch (e) {}

    if (coinbase !== undefined) {
      if (coinbase.outputs[0].value > BLOCK_REWARD + fees) {
        throw new CustomError(`Coinbase transaction does not respect macroeconomic policy. `
            + `Coinbase output was ${coinbase.outputs[0].value}, while reward is ${BLOCK_REWARD} and fees were ${fees}.`, INVALID_BLOCK_COINBASE)
      }
      if (coinbase.height !== height) {
        throw new CustomError(`Coinbase transaction ${coinbase.txid} of block ${this.blockid} indicates height ${coinbase.height}, `
            + `while the block has height ${height}.`, INVALID_BLOCK_COINBASE)
      }
      // check if any transaction spend the coinbase transaction
      // check if there are multiple coinbase transactions present
      const cbtxid = coinbase.txid;
      let skipFirst = true;
      // assert: there is a coinbase transaction at the first position
      for (const tx of txs) {
        if(skipFirst)
        { // skip the coinbase transaction
          skipFirst = false;
          continue;
        }
        if(!tx.isCoinbase())
        {
          for(const input of tx.inputs)
          {
            if(input.outpoint.txid == coinbase.txid)
              throw new CustomError(`Transaction ${input.outpoint.txid} spends output of coinbase transaction from same block`, INVALID_TX_OUTPOINT);
          }
        }
        else // if there is a coinbase transaction not at the first position, this is invalid
          throw new CustomError(`More than one coinbase transactions set in block!`, INVALID_BLOCK_COINBASE);
      }
    }
    else
    {
      // check if there really is no coinbase transaction in the tx array
      for(const tx of txs)
      {
        if(tx.isCoinbase())
          throw new CustomError(`A coinbase transaction present not at the first position`, INVALID_BLOCK_COINBASE);
      }
    }

    this.stateAfter = stateAfter
    logger.debug(`UTXO state of block ${this.blockid} cached: ${JSON.stringify(Array.from(stateAfter.outpoints))}`)
  }

  /**
   * Gets the parent block, returning null on failure
   * @returns Block
   */
  async loadParent(): Promise<Block | null> {
    let parentBlock: Block

    if (this.previd === null) {
      return null
    }
    try {
      const parentObject = await objectManager.get(this.previd)

      if (!BlockObject.guard(parentObject)) {
        return null
      }
      parentBlock = await Block.fromNetworkObject(parentObject)
    }
    catch (e: any) {
      return null
    }
    return parentBlock
  }

  /**
   * TODO: Validates the ancestry of this block until a block that has already been verified is hit
   * @returns parent Block if valid, otherwise null
   */
  async validateAncestry(peer: Peer): Promise<Block | null> {
    if (this.previd === null) {
      // genesis
      return null
    }

    let parentBlock: Block
    try {
      logger.debug(`Retrieving parent block of ${this.blockid} (${this.previd})`)
      const parentObject = await objectManager.retrieve(this.previd)

      if (!BlockObject.guard(parentObject)) {
        throw new CustomError(`Got parent of block ${this.blockid}, but it was not of BlockObject type; rejecting block.`, INVALID_FORMAT)
      }
      parentBlock = await Block.fromNetworkObject(parentObject)

      try {
        // try to load cached block information; this should have been cached
        // as soon as the block was retrieved from the network and validated
        await parentBlock.load()
        logger.debug(`Parent block ${this.previd} of the block ${this.blockid} is already cached.`)
      }
      catch {
        logger.debug(`Awaiting validation of the parent block ${this.previd} of the block ${this.blockid}.`)
        await parentBlock.validate(peer)
      }
    }
    catch (e: any) {
      if(e instanceof CustomError)
        throw e
      throw new CustomError(`Retrieval of block parent for block ${this.blockid} failed; rejecting block: ${e.message}`, UNFINDABLE_OBJECT, true)
    }
    return parentBlock
  }

  /**
   * Validate this block, throwing an error if validation failed
   * @throws Error
   */
  async validate(peer: Peer) {
    logger.debug(`Validating block ${this.blockid}`)

    if (blockManager.deferredValidations[this.blockid] !== undefined) {
      logger.debug(`Block ${this.blockid} is already pending validation. Waiting.`)
      const result: boolean = await blockManager.deferredValidations[this.blockid].promise
      if (!result) {
        throw new CustomError(`Block validation failure received through propagation.`, INVALID_ANCESTRY)
      }
      await this.load()
      return
    }
    const deferred = blockManager.deferredValidations[this.blockid] = new Deferred<boolean>()

    try {
      if (this.T !== TARGET) {
        throw new CustomError(`Block ${this.blockid} does not specify the fixed target ${TARGET}, but uses target ${this.T} instead.`, INVALID_FORMAT)
      }
      logger.debug(`Block target for ${this.blockid} is valid`)
      if (!this.hasPoW()) {
        throw new CustomError(`Block ${this.blockid} does not satisfy the proof-of-work equation; rejecting block.`, INVALID_BLOCK_POW)
      }
      logger.debug(`Block proof-of-work for ${this.blockid} is valid`)

      let parentBlock: Block | null = null
      let stateBefore: UTXOSet | undefined

      if (this.isGenesis()) {
        this.height = 0
        if (!util.isDeepStrictEqual(this.toNetworkObject(), GENESIS)) {
          throw new CustomError(`Invalid genesis block ${this.blockid}: ${JSON.stringify(this.toNetworkObject())}`, INVALID_GENESIS)
        }
        logger.debug(`Block ${this.blockid} is genesis block`)
        // genesis state
        stateBefore = new UTXOSet(new Set<string>())
        logger.debug(`State before block ${this.blockid} is the genesis state`)
      }
      else {
        parentBlock = await this.validateAncestry(peer)

        if (parentBlock === null) {
          throw new CustomError(`Parent block of block ${this.blockid} was null`, INVALID_GENESIS)
        }

        logger.debug(`Ancestry validation of ${this.blockid} successful.`)

        const parentHeight = parentBlock.height

        if (parentHeight === undefined) {
          throw new Error(`Parent block ${parentBlock.blockid} of block ${this.blockid} has no known height`) // assert: false
        }

        if (parentBlock.created >= this.created) {
          throw new CustomError(`Parent block ${parentBlock.blockid} created at ${parentBlock.created} has future timestamp of `
              + `block ${this.blockid} created at ${this.created}.`, INVALID_BLOCK_TIMESTAMP)
        }
        const currentUNIXtimestamp = Math.floor(new Date().getTime() / 1000)
        if (this.created > currentUNIXtimestamp) {
          throw new CustomError(`Block ${this.blockid} has a timestamp ${this.created} in the future. `
              + `Current time is ${currentUNIXtimestamp}.`, INVALID_BLOCK_TIMESTAMP)
        }

        this.height = parentHeight + 1
        logger.debug(`Block ${this.blockid} has height ${this.height}.`)

        // this block's starting state is the previous block's ending state
        stateBefore = parentBlock.stateAfter
        logger.debug(`Loaded state before block ${this.blockid}`)
      }
      logger.debug(`Block ${this.blockid} has valid ancestry`)

      if (stateBefore === undefined) {
        throw new Error(`We have not calculated the state of the parent block,`
            + `so we cannot calculate the state of the current block with blockid = ${this.blockid}`) // assert: false
      }

      logger.debug(`State before block ${this.blockid} is ${stateBefore}`)

      await this.validateTx(peer, stateBefore, this.height)
      logger.debug(`Block ${this.blockid} has valid transactions`)

      this.valid = true
      await this.save()
      await chainManager.onValidBlockArrival(this)
    }
    catch (e: any) {
      deferred.resolve(false)
      delete blockManager.deferredValidations[this.blockid]
      throw e
    }
    deferred.resolve(true)
    delete blockManager.deferredValidations[this.blockid]
  }

  /**
   * save this block (alongside meta information) in the database
   */
  async save() {
    if (this.stateAfter === undefined) {
      throw new Error(`Cannot save block ${this.blockid} with uncalculate state`) // assert: false
    }

    await db.put(`blockinfo:${this.blockid}`, {
      height: this.height,
      stateAfterOutpoints: Array.from(this.stateAfter.outpoints)
    })
    logger.debug(`Stored valid block ${this.blockid} metadata.`)
  }

  /**
   * load this block data and meta information
   */
  async load() {
    logger.debug(`Loading block ${this.blockid} metadata.`)

    const { height, stateAfterOutpoints } = await db.get(`blockinfo:${this.blockid}`)

    logger.debug(`Block ${this.blockid} metadata loaded from database.`)

    this.height = height
    this.stateAfter = new UTXOSet(new Set<string>(stateAfterOutpoints))
    this.valid = true
  }
}
