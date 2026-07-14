# Supply Chain Security

> Package: `packages/hardening` (`supply-chain.ts`) · Sprint P0.4.5 · Constitution §16.

## Trust boundaries
Only a build with a complete, verifiable `ReleaseEvidenceBundle` (provenance,
SBOM, build attestation, dependency + artifact digests, builder identity, test +
scan evidence, signature) may enter a trusted runtime. Unverifiable provenance is
rejected in production. Test fixtures are explicitly separate from production
artifacts.

## Invariants
- Every production artifact carries source revision, build identity/timestamp,
  dependency digest, artifact digest, builder identity, test evidence, scan
  evidence, signature reference and provenance reference.
- Missing/empty evidence → INCOMPLETE → rejected in production (fail closed).

## State machine
`build → evidence-bundle → verifyReleaseEvidence → COMPLETE|INCOMPLETE → (verify
artifact) → admit|reject`.

## Threat model
Dependency tampering (digest), forged provenance (evidence missing), malicious
build (untrusted builder), vulnerable dependency (scan evidence + policy).

## Failure modes
INCOMPLETE evidence, failing security scan over policy, unknown provenance → all
fail closed.

## Human approval points
Vulnerability waivers (`WAIVED_WITH_APPROVAL`) require explicit human approval.

## Audit requirements
Evidence verification outcomes and vulnerability decisions are audited.

## Production adapter requirements
SLSA-style provenance attestation, SBOM generation (CycloneDX/SPDX), a scanner
integration, and a signing service.

## Rollback / recovery
Reject-and-quarantine the artifact; roll back to the last verified release.

## 2035 extension points
Federated builders, reproducible builds, per-region provenance policies, and
hardware-rooted attestation plug in behind these contracts.
