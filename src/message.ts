import { Literal,
         Record, Array, Union,
         String, Number,
         Static, Null, Unknown, Optional } from 'runtypes'

/**
 * This file defines all Objects and Message Types that can be conveniently be used later
 */

const Hash = String.withConstraint(s => /^[0-9a-f]{64}$/.test(s))
const Sig = String.withConstraint(s => /^[0-9a-f]{128}$/.test(s))
const PK = String.withConstraint(s => /^[0-9a-f]{64}$/.test(s))
const NonNegative = Number.withConstraint(n => n >= 0)
const Coins = NonNegative
export const HumanReadable = String.withConstraint(
    s =>
        s.length <= 128 &&
        s.match(/^[ -~]+$/) !== null // ASCII-printable
)

export const INVALID_FORMAT = 'INVALID_FORMAT'
export const INVALID_HANDSHAKE = 'INVALID_HANDSHAKE'
export const UNKNOWN_OBJECT = 'UNKNOWN_OBJECT'
export const INVALID_TX_CONSERVATION = 'INVALID_TX_CONSERVATION'
export const INVALID_TX_SIGNATURE = 'INVALID_TX_SIGNATURE'
export const INVALID_TX_OUTPOINT = 'INVALID_TX_OUTPOINT'
export const INVALID_BLOCK_POW = 'INVALID_BLOCK_POW'
export const INVALID_BLOCK_TIMESTAMP = 'INVALID_BLOCK_TIMESTAMP'
export const INVALID_BLOCK_COINBASE = 'INVALID_BLOCK_COINBASE'
export const INVALID_GENESIS = 'INVALID_GENESIS'
export const UNFINDABLE_OBJECT = 'UNFINDABLE_OBJECT'
export const INVALID_ANCESTRY = 'INVALID_ANCESTRY'

const ErrorName = Union(
    Literal(INVALID_FORMAT),
    Literal(INVALID_HANDSHAKE),
    Literal(INVALID_TX_CONSERVATION),
    Literal(INVALID_TX_SIGNATURE),
    Literal(INVALID_TX_OUTPOINT),
    Literal(INVALID_BLOCK_POW),
    Literal(INVALID_BLOCK_TIMESTAMP),
    Literal(INVALID_BLOCK_COINBASE),
    Literal(INVALID_GENESIS),
    Literal(UNKNOWN_OBJECT),
    Literal(UNFINDABLE_OBJECT),
    Literal(INVALID_ANCESTRY)
)

export type ErrorNameType = Static<typeof ErrorName>

/**
 * this defines an OutpointObject to be a Record (something like a dictionary) 
 *  containing properties txid of type Hash and index of type NonNegative  
 */
export const OutpointObject = Record({
  txid: Hash,
  index: NonNegative
})

/**
 * this exports a type for OutpointObject
 * you an use these as an example to define the other types
 */
export type OutpointObjectType = Static<typeof OutpointObject>

export const TransactionInputObject = Record({
  outpoint: OutpointObject,
  sig: Union(Sig, Null)
})
export type TransactionInputObjectType = Static<typeof TransactionInputObject>

export const TransactionOutputObject = Record({
  pubkey: PK,
  value: Coins
})
export type TransactionOutputObjectType = Static<typeof TransactionOutputObject>

export const CoinbaseTransactionObject = Record({
  type: Literal('transaction'),
  outputs: Array(TransactionOutputObject).withConstraint(a => a.length <= 1),
  height: NonNegative
})
export const SpendingTransactionObject = Record({
  type: Literal('transaction'),
  inputs: Array(TransactionInputObject),
  outputs: Array(TransactionOutputObject)
})
export const TransactionObject = Union(CoinbaseTransactionObject, SpendingTransactionObject)
export type TransactionObjectType = Static<typeof TransactionObject>

export const BlockObject = Record({
  type: Literal('block'),
  txids: Array(Hash),
  nonce: String,
  previd: Union(Hash, Null),
  created: Number,
  T: Hash,
  miner: Optional(HumanReadable),
  note: Optional(HumanReadable)
})
export type BlockObjectType = Static<typeof BlockObject>


export const HelloMessage = Record({
  type: Literal('hello'),
  version: String,
  agent: String
})
export type HelloMessageType = Static<typeof HelloMessage>

export const GetPeersMessage = Record({
  type: Literal('getpeers')
})
export type GetPeersMessageType = Static<typeof GetPeersMessage>

export const PeersMessage = Record({
  type: Literal('peers'),
  peers: Array(String)
})
export type PeersMessageType = Static<typeof PeersMessage>

export const GetObjectMessage = Record({
  type: Literal('getobject'),
  objectid: Hash
})
export type GetObjectMessageType = Static<typeof GetObjectMessage>

export const IHaveObjectMessage = Record({
  type: Literal('ihaveobject'),
  objectid: Hash
})
export type IHaveObjectMessageType = Static<typeof IHaveObjectMessage>

export const Object = Union(TransactionObject, BlockObject)
export type ObjectType = Static<typeof Object>

export const ObjectMessage = Record({
  type: Literal('object'),
  object: Object
})
export type ObjectMessageType = Static<typeof ObjectMessage>

export const GetChainTipMessage = Record({
  type: Literal('getchaintip')
})
export type GetChainTipMessageType = Static<typeof GetChainTipMessage>

export const ChainTipMessage = Record({
  type: Literal('chaintip'),
  blockid: Hash
})
export type ChainTipMessageType = Static<typeof ChainTipMessage>

export const GetMempoolMessage = String
export type GetMempoolMessageType = String

export const MempoolMessage = String
export type MempoolMessageType = String

export const ErrorMessage = Record({
  type: Literal('error'),
  msg: String,
  name: ErrorName
})
export type ErrorMessageType = Static<typeof ErrorMessage>

export const Messages = [
  HelloMessage,
  GetPeersMessage, PeersMessage,
  IHaveObjectMessage, GetObjectMessage, ObjectMessage,
  GetChainTipMessage, ChainTipMessage,
  /*GetMempoolMessage, MempoolMessage,*/
  ErrorMessage
]
export const Message = Union(
  HelloMessage,
  GetPeersMessage, PeersMessage,
  IHaveObjectMessage, GetObjectMessage, ObjectMessage,
  GetChainTipMessage, ChainTipMessage,
  /*GetMempoolMessage, MempoolMessage,*/
  ErrorMessage
)
export type MessageType = Static<typeof Message>
