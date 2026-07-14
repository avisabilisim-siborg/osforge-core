/**
 * Revocation foundation (requirement §10).
 *
 * A single, technology-neutral registry of revoked objects. A revoked object can
 * never be reused because the check is authoritative and MUST be performed
 * before critical execution — not cached by the consumer and not bypassable by a
 * restart (a durable backend persists revocations).
 */
export type RevocableKind =
  | "publisher"
  | "artifact"
  | "plugin"
  | "mcp_server"
  | "signing_key"
  | "policy_artifact"
  | "adapter"
  | "capability"
  | "secret_lease";

export interface RevocationEntry {
  kind: RevocableKind;
  id: string;
  reason: string;
  revokedAt: string;
}

export interface RevocationRegistry {
  readonly durable: boolean;
  isRevoked(kind: RevocableKind, id: string): boolean;
  revoke(entry: RevocationEntry): void;
  list(): readonly RevocationEntry[];
}

export class InMemoryRevocationRegistry implements RevocationRegistry {
  readonly durable: boolean;
  readonly #revoked = new Map<string, RevocationEntry>();

  constructor(options: { durable?: boolean } = {}) {
    this.durable = options.durable ?? false;
  }

  #key(kind: RevocableKind, id: string): string {
    return `${kind}:${id}`;
  }

  isRevoked(kind: RevocableKind, id: string): boolean {
    return this.#revoked.has(this.#key(kind, id));
  }

  revoke(entry: RevocationEntry): void {
    this.#revoked.set(this.#key(entry.kind, entry.id), { ...entry });
  }

  list(): readonly RevocationEntry[] {
    return [...this.#revoked.values()];
  }
}

/** Fail-closed guard: MUST be called immediately before a critical operation. */
export function assertNotRevoked(registry: RevocationRegistry, kind: RevocableKind, id: string): void {
  if (registry.isRevoked(kind, id)) {
    throw new Error(`${kind} '${id}' is revoked.`);
  }
}
