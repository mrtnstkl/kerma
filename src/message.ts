import {
  Literal,
  Record, Array, Union,
  String, Number,
  Static, Null, Unknown, Optional
} from 'runtypes'

/**
 * This file defines all Objects and Message Types that can be conveniently be used later
 */

const Hash = String.withConstraint(s => true) /* TODO */
const Sig = String.withConstraint(s => true) /* TODO */
const PK = String.withConstraint(s => true) /* TODO */
const NonNegative = Number.withConstraint(n => true) /* TODO */
const Coins = NonNegative

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

/* TODO */
export const CoinbaseTransactionObject = Boolean
export const SpendingTransactionObject = Boolean
export const TransactionObject = Boolean
export type TransactionObjectType = Boolean

export const BlockObject = Record({
  type: Literal('block'),
  txids: Array(Hash),
  nonce: String,
  previd: Union(Hash, Null),
  created: Number,
  T: Hash,
  miner: Optional(String), /* TODO: enforce checks */
  note: Optional(String) /* TODO: enforce checks */
})
export type BlockObjectType = Static<typeof BlockObject>


// Helper types
const Version = String.withConstraint((value) => /^0\.10\.[0-9]$/.test(value));
const Agent = String.withConstraint((value) => {
  if (value.length > 128) return false;

  // Check all characters are ASCII-printable
  return /^[\x20-\x7E]*$/.test(value);
})

// Message types

export const HelloMessage = Record({
  type: Literal('hello'),
  version: Version,
  agent: Agent
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
  type: Literal('getobject')
  /* TODO: finish this type */
})
export type GetObjectMessageType = Static<typeof GetObjectMessage>

export const IHaveObjectMessage = Record({
  type: Literal('ihaveobject')
  /* TODO: finish this type */
})
export type IHaveObjectMessageType = Static<typeof IHaveObjectMessage>

export const Object = String
export type ObjectType = String

export const ObjectMessage = Record({
  type: Literal('object')
  /* TODO: finish this type */
})
export type ObjectMessageType = Static<typeof ObjectMessage>

export const GetChainTipMessage = Record({
  type: Literal('getchaintip')
  /* TODO: finish this type */
})
export type GetChainTipMessageType = Static<typeof GetChainTipMessage>

export const ChainTipMessage = Record({
  type: Literal('chaintip')
  /* TODO: finish this type */
})
export type ChainTipMessageType = Static<typeof ChainTipMessage>

export const GetMempoolMessage = Record({
  type: Literal('getmempool')
  /* TODO: finish this type */
})
export type GetMempoolMessageType = Static<typeof GetMempoolMessage>

export const MempoolMessage = Record({
  type: Literal('mempool')
  /* TODO: finish this type */
})
export type MempoolMessageType = Static<typeof MempoolMessage>

export const ErrorCode = Union(Literal('INVALID_FORMAT'), Literal('INVALID_HANDSHAKE')) // TODO: Add rest of the error codes
export type ErrorCodeType = Static<typeof ErrorCode>

export const ErrorMessage = Record({
  type: Literal('error'),
  name: ErrorCode,
  msg: String
})
export type ErrorMessageType = Static<typeof ErrorMessage>

export const Messages = [
  HelloMessage,
  GetPeersMessage, PeersMessage,
  IHaveObjectMessage, GetObjectMessage, ObjectMessage,
  GetChainTipMessage, ChainTipMessage,
  GetMempoolMessage, MempoolMessage,
  ErrorMessage
]
export const Message = Union(
  HelloMessage,
  GetPeersMessage, PeersMessage,
  IHaveObjectMessage, GetObjectMessage, ObjectMessage,
  GetChainTipMessage, ChainTipMessage,
  GetMempoolMessage, MempoolMessage,
  ErrorMessage
)
export type MessageType = Static<typeof Message>
