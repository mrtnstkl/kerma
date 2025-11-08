import { createHash } from 'crypto'

const blake2 = createHash('BLAKE2s256') 

/**
 * returns the sha256 representation of given string
 * @param str 
 */
export function hash(str: string) {
  return blake2.update(str).digest('hex')
}
