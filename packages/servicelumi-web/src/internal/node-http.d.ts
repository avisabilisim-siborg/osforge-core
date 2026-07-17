// Minimal ambient declarations for the Node built-ins the ServiceLumi web
// server uses (repo pattern: no @types/node dependency; see the per-package
// internal/node-crypto.d.ts files). Only the surface actually used is typed.

declare module "node:http" {
  export interface IncomingMessage {
    readonly url?: string;
    readonly method?: string;
    readonly headers: { readonly cookie?: string };
    on(event: "data", listener: (chunk: { toString(encoding: string): string; length: number }) => void): void;
    on(event: "end", listener: () => void): void;
    on(event: "error", listener: (error: Error) => void): void;
    destroy(): void;
  }
  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string | string[]>): void;
    end(body?: string): void;
  }
  export interface AddressInfo {
    readonly port: number;
  }
  export interface Server {
    listen(port: number, host: string, callback: () => void): void;
    close(callback: () => void): void;
    address(): AddressInfo | string | null;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server;
}

declare const process: {
  readonly env: Record<string, string | undefined>;
  exitCode?: number;
};

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare class URL {
  constructor(input: string, base?: string);
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
}

declare class URLSearchParams {
  constructor(init?: string | Record<string, string>);
  get(name: string): string | null;
  set(name: string, value: string): void;
  toString(): string;
}
