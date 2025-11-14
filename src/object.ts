export type ObjectId = string;

import level from 'level-ts';
import {
  Object,
  ObjectType,
  TransactionObject,
  ErrorMessage,
  ErrorMessageType,
  CoinbaseTransactionObject,
  BlockObject,
} from './message';
import { Transaction } from './transaction';
import { Block } from './block';
import { logger } from './logger';
import { hash } from './crypto/hash';
import { Peer } from './peer';
import { Deferred, delay, resolveToReject } from './promise';
import { mempool } from './mempool';
import { Literal, match, Record, Static, Union, when } from 'runtypes';

const envDatabaseDirectory = process.env.OBJECT_DATABASE_DIRECTORY;
const databaseDirectory =
  envDatabaseDirectory !== undefined && envDatabaseDirectory !== '' ? envDatabaseDirectory : './db';

export const db = new level(databaseDirectory);
const OBJECT_AVAILABILITY_TIMEOUT = 5000; // ms

export const ValidationResult = Union(
  Record({ success: Literal(true) }),
  Record({ success: Literal(false), error: ErrorMessage }),
);
export type ValidationResultType = Static<typeof ValidationResult>;

/**
 * Interfaces the database
 */
class ObjectManager {
  /* TODO */

  /**
   * Clears all objects from the database
   */
  async clear() {
    logger.info(`Clearing all objects from database`);
    const objects = await db.stream({ all: 'object:' });
    for (const { key, value } of objects) {
      await db.del(key);
    }
  }

  /**
   * Dumps all stored objects into a map and returns it
   * @returns map of objectid -> object
   */
  async dump() {
    const result = new Map<ObjectId, ObjectType>();
    const objects = await db.stream({ all: 'object:' });
    for (let { key, value } of objects) {
      key = key.slice('object:'.length);
      try {
        value = Object.check(value);
      } catch (error) {
        logger.warn(`Invalid object in database with ID ${key}: %o`, error);
        continue;
      }
      result.set(key, value);
    }
    return result;
  }

  /**
   * Converts an object to its canonical string representation
   * @param obj the object to serialize
   * @returns canonical string representation
   */
  toCanonicalString(obj: any): string {
    if (Array.isArray(obj)) {
      // arrays
      const arrItems = obj.map((item) => this.toCanonicalString(item));
      return '[' + arrItems.join(',') + ']';
    }
    if (typeof obj === 'object' && obj !== null) {
      // objects
      const keys = globalThis.Object.keys(obj).sort();
      const keyValuePairs = keys.map((key) => `"${key}":${this.toCanonicalString(obj[key])}`);
      return '{' + keyValuePairs.join(',') + '}';
    }
    // primitives
    return JSON.stringify(obj);
  }

  id(obj: any) {
    const serialized = this.toCanonicalString(obj);
    return hash(serialized);
  }

  /**
   * Checks if you know about this object
   * @param objectid
   */
  async exists(objectid: ObjectId) {
    return await db.exists('object:' + objectid);
  }

  async get(objectid: ObjectId): Promise<ObjectType> {
    return await db.get('object:' + objectid);
  }

  async del(objectid: ObjectId) {
    logger.info(`Deleting object ${objectid} from database`);
    return await db.del('object:' + objectid);
  }

  async put(object: ObjectType) {
    const objectid = this.id(object);
    logger.info(`Storing object ${objectid} in database`);
    await db.put('object:' + objectid, object);
    return objectid;
  }

  /**
   * Attempts to retrieve an object from a peer
   * @param objectid the object to get
   * @param peer the peer you want to get the object from
   * @returns the object, or rejects if not possible
   */
  async retrieve(objectid: ObjectId, peer: Peer): Promise<Boolean> {
    // todo: Promise<ObjectType>
    /* TODO */
    return true;
  }
}

export const objectManager = new ObjectManager();
