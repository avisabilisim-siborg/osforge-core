// Minimal ambient declarations for the Node built-ins used by this package.
//
// This package deliberately adds NO npm dependency. `@types/node` is not
// installed in this repo, so the small surface of `node:crypto` and the global
// `Buffer` used for HMAC/SHA integrity markers is declared locally here.
//
// PRODUCTION NOTE: replacing this shim with `@types/node` (a dev-only type
// package) is the recommended follow-up; it changes no runtime behavior.

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
  export function timingSafeEqual(a: NodeBufferLike, b: NodeBufferLike): boolean;
}
