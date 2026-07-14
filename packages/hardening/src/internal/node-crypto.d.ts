// Minimal ambient declarations for the Node built-ins used by this package.
// This package adds NO npm dependency; @types/node is not installed.
interface NodeBufferLike { readonly length: number; }
declare const Buffer: { from(input: string, encoding?: string): NodeBufferLike };
declare module "node:crypto" {
  interface NodeHash {
    update(data: string, inputEncoding?: string): NodeHash;
    digest(encoding: string): string;
  }
  export function createHash(algorithm: string): NodeHash;
  export function createHmac(algorithm: string, key: string): NodeHash;
  export function timingSafeEqual(a: NodeBufferLike, b: NodeBufferLike): boolean;
}
