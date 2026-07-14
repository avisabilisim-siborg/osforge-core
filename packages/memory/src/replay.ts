import { canonicalJson, sha256Hex } from "./internal/crypto.js";

/**
 * Replay verification (P0.5). A generic tamper-evident chain verifier reused by
 * episodic memory and snapshot replay. Replay is verified, never trusted.
 */
export const REPLAY_GENESIS = "0".repeat(64);

export interface ChainLink {
  sequence: number;
  previousHash: string;
  currentHash: string;
  body: Record<string, unknown>;
}

export interface ReplayVerification {
  verified: boolean;
  reasonCode: string;
  verifiedCount: number;
}

export function computeLinkHash(previousHash: string, sequence: number, body: Record<string, unknown>): string {
  return sha256Hex(canonicalJson({ previousHash, sequence, body }));
}

export function verifyChain(links: readonly ChainLink[]): ReplayVerification {
  let previous = REPLAY_GENESIS;
  let expected = 1;
  let verifiedCount = 0;
  for (const link of links) {
    if (link.previousHash !== previous || link.sequence !== expected) {
      return { verified: false, reasonCode: "chain_broken", verifiedCount };
    }
    if (computeLinkHash(previous, link.sequence, link.body) !== link.currentHash) {
      return { verified: false, reasonCode: "hash_mismatch", verifiedCount };
    }
    previous = link.currentHash;
    expected += 1;
    verifiedCount += 1;
  }
  return { verified: true, reasonCode: "verified", verifiedCount };
}
