import type { AdapterHealthStatus, AdapterMetadata, ProductionAdapter } from "./common.js";
import { strongRandomHex, strongUuid } from "./internal/crypto.js";

/**
 * ID factory adapters (requirement §6).
 *
 * Production ids are cryptographically strong, collision-resistant and
 * unpredictable, and embed NO tenant information. The sequential test factory is
 * predictable and is refused in production by `assertProductionIdFactory`.
 */
export interface IdFactoryAdapter extends ProductionAdapter {
  next(prefix: string): string;
  /** Instance-sortable id (counter-prefixed) for ordered storage keys. */
  sortableNext(prefix: string): string;
}

export class SecureRandomIdFactory implements IdFactoryAdapter {
  readonly metadata: AdapterMetadata = {
    id: "secure-random-id-factory",
    kind: "id_factory",
    version: "1.0.0",
    testOnly: false,
    productionReady: true,
    attestation: "TRUSTED",
    supportedEnvironments: ["test", "development", "staging", "production"]
  };
  #counter = 0;

  next(prefix: string): string {
    return `${prefix}_${strongUuid()}`;
  }

  sortableNext(prefix: string): string {
    this.#counter += 1;
    return `${prefix}_${String(this.#counter).padStart(12, "0")}_${strongRandomHex(8)}`;
  }

  health(): AdapterHealthStatus {
    return "READY";
  }
}

export class SequentialTestIdFactory implements IdFactoryAdapter {
  readonly metadata: AdapterMetadata = {
    id: "sequential-test-id-factory",
    kind: "id_factory",
    version: "1.0.0",
    testOnly: true,
    productionReady: false,
    attestation: "UNATTESTED",
    supportedEnvironments: ["test", "development"]
  };
  #counter = 0;

  next(prefix: string): string {
    this.#counter += 1;
    return `${prefix}_${this.#counter}`;
  }

  sortableNext(prefix: string): string {
    this.#counter += 1;
    return `${prefix}_${String(this.#counter).padStart(12, "0")}`;
  }

  health(): AdapterHealthStatus {
    return "READY";
  }
}

export function assertProductionIdFactory(factory: IdFactoryAdapter): void {
  if (factory.metadata.testOnly || !factory.metadata.productionReady) {
    throw new Error("A test/sequential id factory cannot be used in production.");
  }
}
