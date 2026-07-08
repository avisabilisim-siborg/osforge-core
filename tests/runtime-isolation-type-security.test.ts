import type { ExecutionPermit } from "../packages/policy/src/index.js";
import type {
  ExecutionIdentity,
  IsolationBoundaryDecision,
  ReplayProtectionProvider,
  RuntimeResourceQuota,
  RuntimeExecutionPermit,
  RuntimeIsolationContext,
  SandboxPolicy,
  SandboxProvider,
  SandboxProviderAttestation
} from "../packages/runtime-isolation/src/index.js";
import {
  createRuntimeExecutionPermit,
  createRuntimeResourceQuota,
  createSandboxPolicy,
  createSandboxProviderAttestation,
  createSandboxProvider
} from "../packages/runtime-isolation/src/index.js";

declare const executionPermit: ExecutionPermit;
declare const isolationDecision: IsolationBoundaryDecision;
declare const executionIdentity: ExecutionIdentity;

createRuntimeExecutionPermit({
  permitId: "permit_1",
  executionPermit,
  isolationDecision,
  identity: executionIdentity,
  issuedAt: "2026-07-09T11:59:00.000Z",
  expiresAt: "2026-07-09T12:10:00.000Z",
  now: "2026-07-09T12:00:00.000Z"
});

const runtimeQuota = createRuntimeResourceQuota({
  maxCpuTimeMs: 1000,
  maxMemoryBytes: 1048576,
  maxExecutionTimeMs: 5000,
  maxProcesses: 1
});

createSandboxPolicy({
  capabilities: {
    filesystemRead: "DENY"
  },
  quota: runtimeQuota ?? undefined
});

const providerAttestation = createSandboxProviderAttestation({
  providerId: "provider_1",
  providerType: "testOnly",
  capabilities: ["filesystemRead"],
  environmentMode: "test",
  result: "TRUSTED",
  attestedAt: "2026-07-09T12:00:00.000Z"
});

createSandboxProvider({
  providerId: "provider_1",
  providerType: "testOnly",
  capabilities: ["filesystemRead"],
  attestation: providerAttestation,
  environmentMode: "test",
  createdAt: "2026-07-09T12:00:00.000Z"
});

// @ts-expect-error A plain object cannot forge runtime isolation context.
const forgedContext: RuntimeIsolationContext = {
  tenantId: "tenant_1",
  organizationId: "org_1",
  workspaceId: "workspace_1",
  actorId: "actor_1",
  actorType: "human_user",
  executionId: "execution_1",
  correlationId: "corr_1"
};

// @ts-expect-error A plain object cannot forge execution identity.
const forgedIdentity: ExecutionIdentity = {
  chain: forgedContext
};

// @ts-expect-error A plain object cannot forge isolation boundary decision.
const forgedDecision: IsolationBoundaryDecision = {
  status: "ALLOWED",
  reason: "forged",
  identity: executionIdentity
};

// @ts-expect-error A plain object cannot forge runtime execution permit.
const forgedPermit: RuntimeExecutionPermit = {
  permitId: "permit_1",
  basePermit: executionPermit,
  identity: executionIdentity,
  issuedAt: "2026-07-09T11:59:00.000Z",
  expiresAt: "2026-07-09T12:10:00.000Z",
  oneTimeUse: true
};

// @ts-expect-error A plain object cannot forge replay protection provider.
const forgedReplayProvider: ReplayProtectionProvider = {
  mode: "production",
  store: {
    claim() {
      return { decision: "ALLOWED", reason: "forged" };
    }
  }
};

// @ts-expect-error A plain object cannot forge runtime resource quota.
const forgedQuota: RuntimeResourceQuota = {
  maxCpuTimeMs: 1000,
  maxMemoryBytes: 1048576,
  maxExecutionTimeMs: 5000,
  maxProcesses: 1
};

// @ts-expect-error A plain object cannot forge sandbox policy.
const forgedSandboxPolicy: SandboxPolicy = {
  capabilities: {
    filesystemRead: "ALLOW",
    filesystemWrite: "ALLOW",
    networkEgress: "ALLOW",
    shell: "ALLOW",
    childProcess: "ALLOW",
    container: "ALLOW",
    tool: "ALLOW",
    mcp: "ALLOW"
  }
};

// @ts-expect-error A plain object cannot forge sandbox provider attestation.
const forgedSandboxProviderAttestation: SandboxProviderAttestation = {
  result: "TRUSTED",
  providerId: "provider_1",
  providerType: "testOnly",
  environmentMode: "test",
  capabilities: ["filesystemRead"],
  attestedAt: "2026-07-09T12:00:00.000Z"
};

// @ts-expect-error A plain object cannot forge sandbox provider.
const forgedSandboxProvider: SandboxProvider = {
  providerId: "provider_1",
  providerType: "testOnly",
  capabilities: ["filesystemRead"],
  attestation: forgedSandboxProviderAttestation,
  environmentMode: "test",
  createdAt: "2026-07-09T12:00:00.000Z"
};
