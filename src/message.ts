import {
  Literal,
  Record,
  Array,
  Union,
  String,
  Number,
  Static,
  Null,
  Unknown,
  Optional,
} from 'runtypes';

/**
 * This file defines all Objects and Message Types that can be conveniently be used later
 */

const Hash = String.withConstraint((s) => /^[0-9a-f]{64}$/.test(s));
const Sig = String.withConstraint((s) => /^[0-9a-f]{128}$/.test(s));
const PK = String.withConstraint((s) => /^[0-9a-f]{64}$/.test(s));
const NonNegative = Number.withConstraint((n) => n >= 0);
const Coins = NonNegative;

/**
 * this defines an OutpointObject to be a Record (something like a dictionary)
 *  containing properties txid of type Hash and index of type NonNegative
 */
export const OutpointObject = Record({
  txid: Hash,
  index: NonNegative,
});

/**
 * this exports a type for OutpointObject
 * you an use these as an example to define the other types
 */
export type OutpointObjectType = Static<typeof OutpointObject>;

export const TransactionInputObject = Record({
  outpoint: OutpointObject,
  sig: Union(Sig, Null),
});
export type TransactionInputObjectType = Static<typeof TransactionInputObject>;

export const TransactionOutputObject = Record({
  pubkey: PK,
  value: Coins,
});
export type TransactionOutputObjectType = Static<typeof TransactionOutputObject>;

export const CoinbaseTransactionObject = Record({
  type: Literal('transaction'),
  height: NonNegative,
  outputs: Array(TransactionOutputObject).withConstraint((array) => array.length === 1),
});
export type CoinbaseTransactionObjectType = Static<typeof CoinbaseTransactionObject>;

/* TODO */
export const SpendingTransactionObject = Boolean;

export const TransactionObject = Record({
  type: Literal('transaction'),
  inputs: Array(TransactionInputObject),
  outputs: Array(TransactionOutputObject),
});
export type TransactionObjectType = Static<typeof TransactionObject>;

export const GeneralTransactionObject = Union(TransactionObject, CoinbaseTransactionObject);
export type GeneralTransactionObjectType = Static<typeof GeneralTransactionObject>;

export const BlockObject = Record({
  type: Literal('block'),
  txids: Array(Hash),
  nonce: String,
  previd: Union(Hash, Null),
  created: Number,
  T: Hash,
  miner: Optional(String) /* TODO: enforce checks */,
  note: Optional(String) /* TODO: enforce checks */,
});
export type BlockObjectType = Static<typeof BlockObject>;

// Helper types
const Version = String.withConstraint((value) => /^0\.10\.[0-9]$/.test(value));
const Agent = String.withConstraint((value) => {
  if (value.length > 128) return false;

  // Check all characters are ASCII-printable
  return /^[\x20-\x7E]*$/.test(value);
});

// Message types

export const HelloMessage = Record({
  type: Literal('hello'),
  version: Version,
  agent: Agent,
});
export type HelloMessageType = Static<typeof HelloMessage>;

export const GetPeersMessage = Record({
  type: Literal('getpeers'),
});
export type GetPeersMessageType = Static<typeof GetPeersMessage>;

export const PeersMessage = Record({
  type: Literal('peers'),
  peers: Array(String),
});
export type PeersMessageType = Static<typeof PeersMessage>;

export const GetObjectMessage = Record({
  type: Literal('getobject'),
  objectid: Hash,
});
export type GetObjectMessageType = Static<typeof GetObjectMessage>;

export const IHaveObjectMessage = Record({
  type: Literal('ihaveobject'),
  objectid: Hash,
});
export type IHaveObjectMessageType = Static<typeof IHaveObjectMessage>;

export const Object = Union(TransactionObject, CoinbaseTransactionObject, BlockObject);
export type ObjectType = Static<typeof Object>;

export const ObjectMessage = Record({
  type: Literal('object'),
  object: Object,
});
export type ObjectMessageType = Static<typeof ObjectMessage>;

export const ChainObject = Record({
  tip: BlockObject,
  height: Number,
});
export type ChainObjectType = Static<typeof ChainObject>;

export const GetChainTipMessage = Record({
  type: Literal('getchaintip'),
});
export type GetChainTipMessageType = Static<typeof GetChainTipMessage>;

export const ChainTipMessage = Record({
  type: Literal('chaintip'),
  blockid: Hash,
});
export type ChainTipMessageType = Static<typeof ChainTipMessage>;

export const GetMempoolMessage = Record({
  type: Literal('getmempool'),
  /* TODO: finish this type */
});
export type GetMempoolMessageType = Static<typeof GetMempoolMessage>;

export const MempoolMessage = Record({
  type: Literal('mempool'),
  /* TODO: finish this type */
});
export type MempoolMessageType = Static<typeof MempoolMessage>;

const ErrorCode = Union(
  Literal('INVALID_FORMAT'),
  Literal('INVALID_HANDSHAKE'),
  Literal('UNKNOWN_OBJECT'),
  Literal('INVALID_TX_CONSERVATION'),
  Literal('INVALID_TX_SIGNATURE'),
  Literal('INVALID_TX_OUTPOINT'),
  Literal('INVALID_BLOCK_POW'),
  Literal('INVALID_BLOCK_TIMESTAMP'),
  Literal('INVALID_BLOCK_COINBASE'),
  Literal('INVALID_GENESIS'),
  Literal('UNFINDABLE_OBJECT'),
  Literal('INVALID_ANCESTRY'),
); // TODO: Add rest of the error codes
export type ErrorCodeType = Static<typeof ErrorCode>;

export const ErrorMessage = Record({
  type: Literal('error'),
  name: ErrorCode,
  msg: String,
});
export type ErrorMessageType = Static<typeof ErrorMessage>;

export const Messages = [
  HelloMessage,
  GetPeersMessage,
  PeersMessage,
  IHaveObjectMessage,
  GetObjectMessage,
  ObjectMessage,
  GetChainTipMessage,
  ChainTipMessage,
  GetMempoolMessage,
  MempoolMessage,
  ErrorMessage,
];
export const Message = Union(
  HelloMessage,
  GetPeersMessage,
  PeersMessage,
  IHaveObjectMessage,
  GetObjectMessage,
  ObjectMessage,
  GetChainTipMessage,
  ChainTipMessage,
  GetMempoolMessage,
  MempoolMessage,
  ErrorMessage,
);
export type MessageType = Static<typeof Message>;
