import type { AdapterHealthStatus, AttestationStatus, ReadinessDecision } from "../packages/adapters/src/index.js";

// Adapter health is a closed union.
// @ts-expect-error "OK" is not a valid adapter health status.
const badHealth: AdapterHealthStatus = "OK";
void badHealth;

// Attestation status is a closed union.
// @ts-expect-error "MAYBE" is not a valid attestation status.
const badAttestation: AttestationStatus = "MAYBE";
void badAttestation;

// Readiness decision is a closed union.
// @ts-expect-error only READY | STARTUP_REJECTED are valid.
const badDecision: ReadinessDecision = "PENDING";
void badDecision;
