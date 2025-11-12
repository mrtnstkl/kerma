import { ed25519 } from '@noble/curves/ed25519';

export type PublicKey = string;
export type Signature = string;

/**
 * returns true iff the given signature is valid
 * @param sig a signature to check
 * @param message the message that was signed
 * @param pubkey the public key under which the signature should be verified
 */
export async function ver(sig: Signature, message: string, pubkey: PublicKey) {
  try {
    return ed25519.verify(sig, message, pubkey);
  } catch (error) {
    return false;
  }
}

export function isValidPublicKey(pubkey: string): boolean {
  // Regex to check for a 64-character hex string
  const hexRegex = /^[0-9a-fA-F]{64}$/;
  return hexRegex.test(pubkey);
}
