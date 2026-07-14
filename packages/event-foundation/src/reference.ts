/**
 * Reference in-memory components (P0.6.5, §26). Every reference is explicitly
 * `testOnly: true` and `productionReady: false`. A production start must refuse
 * these. Real brokers/stores are connected only through the §25 adapters.
 */
import { decide } from "./types.js";
import type { EventDecision, RuntimeMode, SchemaVersion, TenantId } from "./types.js";
import type { EventSchema, EventSchemaRegistration, EventSchemaRegistry } from "./schema.js";
import type { DeadLetterEnvelope, DeadLetterStore } from "./deadletter.js";

/** Test-only schema registry. Verifies immutability: a version cannot be redefined. */
export class InMemorySchemaRegistry implements EventSchemaRegistry {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byKey = new Map<string, EventSchema>();
  readonly #revoked = new Set<string>();

  #key(name: string, version: SchemaVersion): string {
    return `${name}@${version}`;
  }

  register(reg: EventSchemaRegistration): EventDecision<"REGISTERED" | "REJECTED"> {
    const base = { evaluatedAt: reg.schema.registeredAt };
    const key = this.#key(reg.schema.schemaName, reg.schema.schemaVersion);
    const existing = this.#byKey.get(key);
    if (existing && existing.definitionDigest !== reg.schema.definitionDigest) {
      // A schema version is immutable; silent redefinition is refused (§7).
      return decide<"REGISTERED" | "REJECTED">({ ...base, decision: "REJECTED", reasonCode: "schema_version_immutable", humanReadableReason: "An existing schema version cannot be silently redefined.", nextRequiredAction: "Publish a new version instead of redefining an existing one." });
    }
    this.#byKey.set(key, Object.freeze({ ...reg.schema }));
    return decide<"REGISTERED" | "REJECTED">({ ...base, decision: "REGISTERED", reasonCode: "schema_registered", humanReadableReason: "The schema version was registered.", nextRequiredAction: "Producers may reference this schema version." });
  }

  get(name: string, version: SchemaVersion): EventSchema | undefined {
    return this.#byKey.get(this.#key(name, version));
  }
  isRevoked(name: string, version: SchemaVersion): boolean {
    return this.#revoked.has(this.#key(name, version));
  }
  revoke(name: string, version: SchemaVersion): void {
    this.#revoked.add(this.#key(name, version));
  }
}

export class InMemoryCheckpointStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #offsets = new Map<string, number>();

  advance(tenantId: TenantId, consumerId: string, offset: number): boolean {
    const key = `${tenantId}::${consumerId}`;
    const current = this.#offsets.get(key) ?? 0;
    // A checkpoint only advances; a backward move is refused here (§9).
    if (offset < current) {
      return false;
    }
    this.#offsets.set(key, offset);
    return true;
  }
  get(tenantId: TenantId, consumerId: string): number {
    return this.#offsets.get(`${tenantId}::${consumerId}`) ?? 0;
  }
}

export class DeterministicEventClock {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  #nowMs: number;

  constructor(nowIso: string) {
    const parsed = Date.parse(nowIso);
    this.#nowMs = Number.isFinite(parsed) ? parsed : 0;
  }
  now(): string {
    return new Date(this.#nowMs).toISOString();
  }
  advance(ms: number): void {
    this.#nowMs += ms;
  }
}

export interface ReferenceIntegrityInput {
  expectedDigest: string;
  actualDigest: string;
}
export class ReferenceIntegrityVerifier {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  verify(input: ReferenceIntegrityInput): { ok: boolean; reasonCode: string } {
    return input.expectedDigest === input.actualDigest
      ? { ok: true, reasonCode: "integrity_ok" }
      : { ok: false, reasonCode: "integrity_mismatch" };
  }
}

/** Test-only dead-letter store. Append/quarantine only — never deletes (§15). */
export class InMemoryDeadLetterStore implements DeadLetterStore {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #byTenant = new Map<string, DeadLetterEnvelope[]>();

  put(entry: DeadLetterEnvelope): void {
    const list = this.#byTenant.get(entry.tenantId) ?? [];
    list.push(Object.freeze({ ...entry }));
    this.#byTenant.set(entry.tenantId, list);
  }
  get(deadLetterId: string, tenantId: TenantId): DeadLetterEnvelope | undefined {
    return (this.#byTenant.get(tenantId) ?? []).find((e) => e.deadLetterId === deadLetterId);
  }
  list(tenantId: TenantId): readonly DeadLetterEnvelope[] {
    return (this.#byTenant.get(tenantId) ?? []).slice();
  }
}

/**
 * A minimal in-memory bus for tests only. It does NOT guarantee ordering,
 * durability or delivery — those are adapter concerns. It exists to exercise the
 * publish/deliver contracts, never as production infrastructure (§26).
 */
export interface ReferenceBusRecord {
  eventId: string;
  tenantId: string;
  payloadDigest: string;
}
export class ReferenceEventBus {
  readonly testOnly = true as const;
  readonly productionReady = false as const;
  readonly #log: ReferenceBusRecord[] = [];

  append(record: ReferenceBusRecord): void {
    this.#log.push(Object.freeze({ ...record }));
  }
  /** Cross-tenant safe: only this tenant's records are visible. */
  read(tenantId: string): readonly ReferenceBusRecord[] {
    return this.#log.filter((r) => r.tenantId === tenantId);
  }
  size(): number {
    return this.#log.length;
  }
}

/** Production must refuse any test-only reference component (§26). */
export function assertNotTestReferenceInProduction(component: { testOnly: boolean }, mode: RuntimeMode): void {
  if (mode === "production" && component.testOnly === true) {
    throw new Error("A test-only reference component cannot be used in production.");
  }
}
