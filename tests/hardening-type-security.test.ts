import type { ArtifactVerdict, PluginVerdict, SecurityReadinessDecision } from "../packages/hardening/src/index.js";

// Artifact verdicts are a closed union.
// @ts-expect-error "MAYBE" is not a valid artifact verdict.
const badArtifact: ArtifactVerdict = "MAYBE";
void badArtifact;

// Plugin verdicts are a closed union.
// @ts-expect-error "OK" is not a valid plugin verdict.
const badPlugin: PluginVerdict = "OK";
void badPlugin;

// Security readiness decision is a closed union.
// @ts-expect-error "PENDING" is not a valid readiness decision.
const badReadiness: SecurityReadinessDecision = "PENDING";
void badReadiness;
