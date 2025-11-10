export type ObjectId = string

import level from 'level-ts'
import {
  Object, ObjectType,
  TransactionObject,
  ErrorMessage,
  ErrorMessageType,
  CoinbaseTransactionObject,
  BlockObject
} from './message'
import { Transaction } from './transaction'
import { Block } from './block'
import { logger } from './logger'
import { hash } from './crypto/hash'
import { Peer } from './peer'
import { Deferred, delay, resolveToReject } from './promise'
import { mempool } from './mempool'
import { Literal, match, Record, Static, Union, when } from 'runtypes'

export const db = new level('./db')
const OBJECT_AVAILABILITY_TIMEOUT = 5000 // ms

export const ValidationResult = Union(
  Record({ success: Literal(true) }),
  Record({ success: Literal(false), error: ErrorMessage })
)
export type ValidationResultType = Static<typeof ValidationResult>

/**
 * Interfaces the database
 */
class ObjectManager {
  /* TODO */

  /**
   * Converts an object to its canonical string representation
   * @param obj 
   * @returns 
   */
  toCanonicalString(obj: any): string {
    if (Array.isArray(obj)) {
      const arrStr = obj.map((item) => {
        if (typeof item === 'object' && item !== null) {
          return this.toCanonicalString(item)
        } else {
          return JSON.stringify(item)
        }
      })
      return '[' + arrStr.join(',') + ']'
    } else if (typeof obj === 'object' && obj !== null) {
      let str = '{'
      const keys = globalThis.Object.keys(obj).sort()
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        str += JSON.stringify(key) + ':'
        const value = obj[key]
        if (typeof value === 'object' && value !== null) {
          str += this.toCanonicalString(value)
        } else {
          str += JSON.stringify(value)
        }
        if (i < keys.length - 1) {
          str += ','
        }
      }
      str += '}'
      return str
    } else {
      // Handle primitives
      return JSON.stringify(obj)
    }
  }

  id(obj: any) {
    const serialized = this.toCanonicalString(obj)
    return hash(serialized)
  }

  /**
   * Checks if you know about this object
   * @param objectid 
   */
  async exists(objectid: ObjectId) {
    return await db.exists('object:' + objectid)
  }

  async get(objectid: ObjectId) : Promise<ObjectType> {
    return await db.get('object:' + objectid)
  }

  async del(objectid: ObjectId) {
    logger.info(`Deleting object ${objectid} from database`)
    return await db.del('object:' + objectid)
  }

  async put(object: ObjectType) {
    const objectid = this.id(object)
    logger.info(`Storing object ${objectid} in database`)
    await db.put('object:' + objectid, object)
    return objectid
  }

  async validate(object: ObjectType, peer: Peer) : Promise<ValidationResultType> {
    const ok: ValidationResultType = { success: true }
    return await match(

      when(TransactionObject, async obj => {
        // check if all objects referenced by inputs are known
        for (const input of obj.inputs) {
          if (!await this.exists(input.outpoint.txid)) {
            const error: ErrorMessageType = {
              type: 'error',
              msg: `Referenced txid not found: ${input.outpoint.txid}`,
              name: 'UNKNOWN_OBJECT'
            }
            return { success: false, error }
          }
        }
        return ok
      }),

      when(CoinbaseTransactionObject, async obj => {
        return ok
      }),

      when(BlockObject, async obj => {
        // todo: for assignment 2, only transaction objects are valid
        const error: ErrorMessageType = {
          type: 'error',
          msg: 'Invalid object received',
          name: 'INVALID_FORMAT'
        }
        return { success: false, error }
      })

    )(object)
  }

  /**
   * Attempts to retrieve an object from a peer
   * @param objectid the object to get
   * @param peer the peer you want to get the object from
   * @returns the object, or rejects if not possible
   */
  async retrieve(objectid: ObjectId, peer: Peer): Promise<Boolean>  { // todo: Promise<ObjectType>
    /* TODO */
    return true
  }
}

export const objectManager = new ObjectManager()
