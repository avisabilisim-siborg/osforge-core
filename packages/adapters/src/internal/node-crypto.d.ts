// Minimal ambient declarations for the Node built-ins used by this package.
// This package adds NO npm dependency. `@types/node` is not installed, so the
// small surface of `node:crypto` (hashing + strong random ids) is declared here.
// PRODUCTION NOTE: replacing this shim with `@types/node` (dev-only types) is the
// recommended follow-up; it changes no runtime behavior.

interface NodeBufferLike {
  readonly length: number;
}

declare const Buffer: {
  from(input: string, encoding?: string): NodeBufferLike;
};

declare module "node:crypto" {
  interface NodeHash {
    update(data: string, inputEncoding?: string): NodeHash;
    digest(encoding: string): string;
  }
  export function createHash(algorithm: string): NodeHash;
  export function createHmac(algorithm: string, key: string): NodeHash;
  export function randomUUID(): string;
  export function randomBytes(size: number): { toString(encoding: string): string };
  export function timingSafeEqual(a: NodeBufferLike, b: NodeBufferLike): boolean;
}
