import { Literal,
         Record, Array, Union,
         String, Number,
         Static, Null, Unknown, Optional } from 'runtypes'

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


export const HelloMessage = String
export type HelloMessageType = String
export const GetPeersMessage = String
export type GetPeersMessageType = String
export const PeersMessage = String
export type PeersMessageType = String
export const GetObjectMessage = String
export type GetObjectMessageType = String
export const IHaveObjectMessage = String
export type IHaveObjectMessageType = String

export const Object = String
export type ObjectType = String

export const ObjectMessage = String
export type ObjectMessageType = String

export const GetChainTipMessage = String
export type GetChainTipMessageType = String

export const ChainTipMessage = String
export type ChainTipMessageType = String

export const GetMempoolMessage = String
export type GetMempoolMessageType = String

export const MempoolMessage = String
export type MempoolMessageType = String

export const ErrorMessage = String
export type ErrorMessageType = String

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
