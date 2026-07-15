// Minimal ambient declarations for node:crypto. This package adds NO npm dependency.
declare module "node:crypto" {
  interface NodeHash {
    update(data: string, inputEncoding?: string): NodeHash;
    digest(encoding: string): string;
  }
  export function createHash(algorithm: string): NodeHash;
  export function randomUUID(): string;
}
