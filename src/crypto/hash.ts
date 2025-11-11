import { createHash } from 'crypto';

/**
 * returns the sha256 representation of given string
 * @param str
 */
export function hash(str: string) {
    return createHash('BLAKE2s256').update(str).digest('hex');
}
