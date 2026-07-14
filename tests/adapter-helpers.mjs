// Shared builders for production-adapter tests. Not a *.test.mjs.
import { resolveEnvironment } from "../dist/adapters/src/index.js";
export { issuePermit, authorizeFor, NOW, FUTURE, PAST } from "./runtime-helpers.mjs";

/** A metadata-compliant, production-usable adapter stub for exercising the gate/registry. */
export function prodStub(kind, health = "READY") {
  return {
    metadata: { id: `stub-${kind}`, kind, version: "1.0.0", testOnly: false, productionReady: true, attestation: "TRUSTED", supportedEnvironments: ["staging", "production"] },
    health: () => health
  };
}

export function durableClaimBackend() {
  const store = new Map();
  return {
    durable: true,
    providerName: "stub-durable",
    putIfAbsent(key, value) {
      const existing = store.get(key);
      if (existing !== undefined) {
        return { stored: false, existing };
      }
      store.set(key, value);
      return { stored: true };
    }
  };
}

export function durableAuditBackend() {
  const partitions = new Map();
  return {
    durable: true,
    providerName: "stub-durable",
    append(partitionKey, record) {
      const list = partitions.get(partitionKey) ?? [];
      list.push(record);
      partitions.set(partitionKey, list);
    },
    read(partitionKey) {
      return (partitions.get(partitionKey) ?? []).slice();
    },
    head(partitionKey) {
      const list = partitions.get(partitionKey);
      if (!list || list.length === 0) {
        return { sequence: 0, hash: "0".repeat(64) };
      }
      const last = list[list.length - 1];
      return { sequence: last.sequence, hash: last.currentHash };
    }
  };
}

export function durableCheckpointBackend() {
  const records = new Map();
  return {
    durable: true,
    providerName: "stub-durable",
    put(record) { records.set(record.metadata.checkpointId, record); },
    get(id) { return records.get(id); },
    remove(id) { records.delete(id); }
  };
}

export function durableSecretProvider(value = "s3cr3t") {
  return { durable: true, providerName: "stub-durable", async fetch() { return { value, rotationVersion: 1 }; } };
}

export function productionEnvironment() {
  return resolveEnvironment({ declaredMode: "production", explicitProductionOptIn: true, attestationPresent: true });
}

export function devEnvironment() {
  return resolveEnvironment({ declaredMode: "development", explicitProductionOptIn: false, attestationPresent: false });
}
