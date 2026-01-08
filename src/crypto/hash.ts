import { blake2sHex } from "blakejs";

/**
 * returns the hash of given string
 * @param str
 */
export function hash(str: string) {
    return blake2sHex(str);
}
