/**
 * Secret provider port (P0.8 Sprint 12). The boundary NEVER binds a real KMS/Vault/HSM
 * itself — it depends on an injected `SecretMaterializerPort` (dependency inversion,
 * ADR 0016) that a real deployment implements against its KMS/Vault/broker. This file
 * defines only the port + fail-closed production guards and a test-only reference. The
 * port yields a value ONLY inside a sandbox delivery callback; it is never returned to
 * the boundary as a plain string it could log.
 */
import { assertProductionSecretAdapter } from "./types.js";
import type { AdapterMetadata, LeaseId, RuntimeMode, SecretRef } from "./types.js";

export interface MaterializeRequest {
  readonly secretRef: SecretRef;
  readonly leaseId: LeaseId;
  readonly rotationVersion: number;
}

/**
 * A port a real deployment implements over its KMS/Vault/broker. The port must hand the
 * value to `deliver` and never persist or log it. Returning `null` means the provider
 * declined (fail-closed: the boundary treats a null as DELIVERY_DENIED).
 */
export interface SecretMaterializerPort {
  readonly metadata: AdapterMetadata;
  /**
   * Materialize the secret transiently and pass it to `deliver`. The port must return
   * whatever `deliver` returns and must not retain the value afterward.
   */
  materialize<T>(request: MaterializeRequest, deliver: (value: string) => T): Promise<T | null>;
}

export function assertProductionMaterializer(port: SecretMaterializerPort, mode: RuntimeMode): void {
  if (mode === "production") {
    assertProductionSecretAdapter(port.metadata);
  }
}

/**
 * A test-only, in-memory reference port. It refuses to run in production (fail-closed)
 * and holds only caller-provided fixtures. Never a KMS/Vault — it is a stand-in for
 * tests and local composition.
 */
export function createTestReferenceMaterializer(fixtures: Readonly<Record<string, string>>): SecretMaterializerPort {
  return {
    metadata: { id: "secret-access.test-reference-materializer", testOnly: true, productionReady: false },
    async materialize<T>(request: MaterializeRequest, deliver: (value: string) => T): Promise<T | null> {
      const value = fixtures[request.secretRef as string];
      if (value === undefined) {
        return null;
      }
      return deliver(value);
    }
  };
}
