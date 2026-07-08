import type { ActorType, OSForgeContext } from "#protocol";
import { validateOSForgeContext } from "#protocol";
import { isExecutionPermit, type ExecutionPermit } from "#policy";

const runtimeIsolationContextBrand: unique symbol = Symbol("runtime_isolation_context");
const executionIdentityBrand: unique symbol = Symbol("execution_identity");
const isolationBoundaryDecisionBrand: unique symbol = Symbol("isolation_boundary_decision");
const runtimeExecutionPermitBrand: unique symbol = Symbol("runtime_execution_permit");
const replayProtectionProviderBrand: unique symbol = Symbol("replay_protection_provider");
const sandboxPolicyBrand: unique symbol = Symbol("sandbox_policy");
const runtimeResourceQuotaBrand: unique symbol = Symbol("runtime_resource_quota");
const sandboxProviderAttestationBrand: unique symbol = Symbol("sandbox_provider_attestation");
const sandboxProviderBrand: unique symbol = Symbol("sandbox_provider");
const runtimeIsolationContexts = new WeakSet<object>();
const executionIdentities = new WeakSet<object>();
const isolationBoundaryDecisions = new WeakSet<object>();
const runtimeExecutionPermits = new WeakSet<object>();
const basePermitsWithRuntimePermit = new WeakSet<object>();
const consumedRuntimeExecutionPermitObjects = new WeakSet<object>();
const replayProtectionProviders = new WeakSet<object>();
const sandboxPolicies = new WeakSet<object>();
const runtimeResourceQuotas = new WeakSet<object>();
const sandboxProviderAttestations = new WeakSet<object>();
const sandboxProviders = new WeakSet<object>();

export const SANDBOX_CAPABILITIES = [
  "filesystemRead",
  "filesystemWrite",
  "networkEgress",
  "shell",
  "childProcess",
  "container",
  "tool",
  "mcp"
] as const;

export type RuntimeActorType = ActorType | "ai_agent";

export type IsolationDecisionStatus = "ALLOWED" | "DENIED";

export type RuntimeExecutionMode = "test" | "production";

export type SandboxCapability = typeof SANDBOX_CAPABILITIES[number];

export type SandboxCapabilityDecision = "ALLOW" | "DENY";

export type SandboxProviderType = "testOnly" | "localDevelopment" | "productionDistributed";

export type SandboxProviderAttestationResult = "TRUSTED" | "UNTRUSTED" | "UNKNOWN";

export type SandboxEnvironmentMode = "test" | "development" | "staging" | "production";

export type RuntimeIsolationRejectionReason =
  | "missing_identity"
  | "malformed_identity"
  | "cross_tenant_mismatch"
  | "cross_organization_mismatch"
  | "cross_workspace_mismatch"
  | "actor_mismatch"
  | "actor_type_mismatch"
  | "execution_mismatch"
  | "invalid_execution_permit"
  | "invalid_isolation_decision"
  | "expired_runtime_permit"
  | "runtime_permit_identity_mismatch"
  | "runtime_permit_replayed"
  | "state_boundary_mismatch";

export interface RuntimeIsolationContext {
  readonly [runtimeIsolationContextBrand]: "runtime_isolation_context";
  readonly tenantId: string;
  readonly organizationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly actorType: RuntimeActorType;
  readonly executionId: string;
  readonly correlationId: string;
}

export interface ExecutionIdentity {
  readonly [executionIdentityBrand]: "execution_identity";
  readonly chain: RuntimeIsolationContext;
}

export interface RuntimeIsolationContextInput {
  context: OSForgeContext;
  executionId: string;
}

export interface RuntimeIsolationExpectedBinding {
  tenantId?: string;
  organizationId?: string;
  workspaceId?: string;
  actorId?: string;
  actorType?: RuntimeActorType;
  executionId?: string;
}

export interface RuntimeIsolationValidationResult {
  valid: boolean;
  reason?: RuntimeIsolationRejectionReason;
  message: string;
  context?: RuntimeIsolationContext;
}

export interface IsolationBoundaryDecision {
  readonly [isolationBoundaryDecisionBrand]: "isolation_boundary_decision";
  readonly status: IsolationDecisionStatus;
  readonly reason: string;
  readonly identity?: ExecutionIdentity;
}

export interface RuntimeExecutionPermit {
  readonly [runtimeExecutionPermitBrand]: "runtime_execution_permit";
  readonly permitId: string;
  readonly basePermit: ExecutionPermit;
  readonly identity: ExecutionIdentity;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly oneTimeUse: true;
}

export interface RuntimeExecutionPermitRequest {
  permitId: string;
  executionPermit: ExecutionPermit;
  isolationDecision: IsolationBoundaryDecision;
  identity: ExecutionIdentity;
  issuedAt: string;
  expiresAt: string;
  now: string;
}

export interface RuntimePermitConsumptionResult {
  decision: IsolationDecisionStatus;
  reason: string;
}

export type SandboxCapabilitySet = Readonly<Record<SandboxCapability, SandboxCapabilityDecision>>;

export interface RuntimeResourceQuota {
  readonly [runtimeResourceQuotaBrand]: "runtime_resource_quota";
  readonly maxCpuTimeMs: number;
  readonly maxMemoryBytes: number;
  readonly maxExecutionTimeMs: number;
  readonly maxProcesses: number;
}

export interface RuntimeResourceQuotaInput {
  maxCpuTimeMs: unknown;
  maxMemoryBytes: unknown;
  maxExecutionTimeMs: unknown;
  maxProcesses: unknown;
}

export interface SandboxPolicy {
  readonly [sandboxPolicyBrand]: "sandbox_policy";
  readonly capabilities: SandboxCapabilitySet;
  readonly quota?: RuntimeResourceQuota;
}

export interface SandboxPolicyInput {
  capabilities?: Partial<Record<SandboxCapability, SandboxCapabilityDecision>>;
  quota?: RuntimeResourceQuota;
}

export interface SandboxCapabilityEvaluationRequest {
  policy: unknown;
  capability: unknown;
  identity?: unknown;
  quota?: unknown;
}

export interface SandboxCapabilityEvaluationResult {
  decision: IsolationDecisionStatus;
  reason: string;
  capability?: SandboxCapability;
}

export interface SandboxProviderAttestation {
  readonly [sandboxProviderAttestationBrand]: "sandbox_provider_attestation";
  readonly result: SandboxProviderAttestationResult;
  readonly providerId: string;
  readonly providerType: SandboxProviderType;
  readonly environmentMode: SandboxEnvironmentMode;
  readonly capabilities: readonly SandboxCapability[];
  readonly attestedAt: string;
}

export interface SandboxProviderAttestationInput {
  result: unknown;
  providerId: unknown;
  providerType: unknown;
  environmentMode: unknown;
  capabilities: unknown;
  attestedAt: unknown;
}

export interface SandboxProvider {
  readonly [sandboxProviderBrand]: "sandbox_provider";
  readonly providerId: string;
  readonly providerType: SandboxProviderType;
  readonly capabilities: readonly SandboxCapability[];
  readonly attestation: SandboxProviderAttestation;
  readonly environmentMode: SandboxEnvironmentMode;
  readonly createdAt: string;
}

export interface SandboxProviderInput {
  providerId: unknown;
  providerType: unknown;
  capabilities: unknown;
  attestation: unknown;
  environmentMode: unknown;
  createdAt: unknown;
}

export interface SandboxProviderEvaluationRequest {
  provider: unknown;
  policy: unknown;
  capability: unknown;
  environmentMode: SandboxEnvironmentMode;
  identity?: unknown;
  quota?: unknown;
}

export interface SandboxProviderEvaluationResult {
  decision: IsolationDecisionStatus;
  reason: string;
  providerId?: string;
  capability?: SandboxCapability;
}

export interface ReplayProtectionKey {
  permitId: string;
  tenantId: string;
  organizationId: string;
  workspaceId: string;
  actorId: string;
  actorType: RuntimeActorType;
  executionId: string;
}

export interface ReplayProtectionClaim {
  key: ReplayProtectionKey;
  issuedAt: string;
  expiresAt: string;
  claimedAt: string;
}

export interface ReplayProtectionResult {
  decision: IsolationDecisionStatus;
  reason: string;
}

export interface ReplayProtectionStore {
  readonly testOnly?: boolean;
  claim(claim: ReplayProtectionClaim): Promise<ReplayProtectionResult> | ReplayProtectionResult;
}

export interface DistributedReplayProtectionStore extends ReplayProtectionStore {
  readonly providerType: "distributed";
  readonly providerName: string;
  readonly requiresAtomicClaim: true;
}

export interface ReplayProtectionProvider {
  readonly [replayProtectionProviderBrand]: "replay_protection_provider";
  readonly mode: RuntimeExecutionMode;
  readonly store: ReplayProtectionStore;
}

export interface ReplayProtectionProviderRequest {
  mode: RuntimeExecutionMode;
  store: ReplayProtectionStore;
}

export interface RuntimeExecutionGateRequest {
  permit: unknown;
  identity: unknown;
  now: string;
  mode: RuntimeExecutionMode;
  replayProtection?: ReplayProtectionProvider;
}

export interface RuntimeIsolationStateStore {
  write(identity: ExecutionIdentity, key: string, value: unknown): RuntimeIsolationStateResult;
  read(owner: ExecutionIdentity, requester: ExecutionIdentity, key: string): RuntimeIsolationStateResult;
}

export interface RuntimeIsolationStateResult {
  decision: IsolationDecisionStatus;
  reason: string;
  value?: unknown;
}

export class InMemoryReplayProtectionStore implements ReplayProtectionStore {
  readonly testOnly = true;
  readonly #claimsByPermitId = new Map<string, ReplayProtectionClaim>();

  claim(claim: ReplayProtectionClaim): ReplayProtectionResult {
    if (!isReplayProtectionClaim(claim)) {
      return { decision: "DENIED", reason: "Replay claim is malformed." };
    }

    if (!isFuture(claim.expiresAt, claim.claimedAt)) {
      return { decision: "DENIED", reason: "Replay claim is expired." };
    }

    const existing = this.#claimsByPermitId.get(claim.key.permitId);
    if (existing) {
      return {
        decision: "DENIED",
        reason: sameReplayKey(existing.key, claim.key)
          ? "Runtime execution permit has already been consumed."
          : "Runtime execution permit was replayed with a different identity binding."
      };
    }

    this.#claimsByPermitId.set(claim.key.permitId, deepFreeze({
      key: deepFreeze({ ...claim.key }),
      issuedAt: claim.issuedAt,
      expiresAt: claim.expiresAt,
      claimedAt: claim.claimedAt
    }));

    return { decision: "ALLOWED", reason: "Replay claim accepted." };
  }
}

export function createReplayProtectionProvider(
  request: ReplayProtectionProviderRequest
): ReplayProtectionProvider | null {
  try {
    if (typeof request !== "object" || request === null) {
      return null;
    }

    if (request.mode !== "test" && request.mode !== "production") {
      return null;
    }

    if (request.mode === "production" && !isDistributedReplayProtectionStore(request.store)) {
      return null;
    }

    if (request.mode === "test" && !isReplayProtectionStore(request.store)) {
      return null;
    }

    const store = snapshotReplayProtectionStore(request.mode, request.store);
    if (!store) {
      return null;
    }

    const provider: ReplayProtectionProvider = {
      [replayProtectionProviderBrand]: "replay_protection_provider",
      mode: request.mode,
      store
    };
    replayProtectionProviders.add(provider);

    return deepFreeze(provider);
  } catch {
    return null;
  }
}

export function createRuntimeResourceQuota(input: RuntimeResourceQuotaInput): RuntimeResourceQuota | null {
  try {
    if (typeof input !== "object" || input === null) {
      return null;
    }

    if (
      !isPositiveInteger(input.maxCpuTimeMs) ||
      !isPositiveInteger(input.maxMemoryBytes) ||
      !isPositiveInteger(input.maxExecutionTimeMs) ||
      !isPositiveInteger(input.maxProcesses)
    ) {
      return null;
    }

    const quota: RuntimeResourceQuota = {
      [runtimeResourceQuotaBrand]: "runtime_resource_quota",
      maxCpuTimeMs: input.maxCpuTimeMs,
      maxMemoryBytes: input.maxMemoryBytes,
      maxExecutionTimeMs: input.maxExecutionTimeMs,
      maxProcesses: input.maxProcesses
    };
    runtimeResourceQuotas.add(quota);

    return deepFreeze(quota);
  } catch {
    return null;
  }
}

export function createDefaultSandboxPolicy(): SandboxPolicy {
  return createSandboxPolicy({}) as SandboxPolicy;
}

export function createSandboxPolicy(input: SandboxPolicyInput): SandboxPolicy | null {
  try {
    if (typeof input !== "object" || input === null) {
      return null;
    }

    if (input.quota !== undefined && !isRuntimeResourceQuota(input.quota)) {
      return null;
    }

    const capabilityInput = input.capabilities;
    const capabilities = defaultSandboxCapabilities();
    if (capabilityInput !== undefined) {
      if (typeof capabilityInput !== "object" || capabilityInput === null || Array.isArray(capabilityInput)) {
        return null;
      }

      for (const [capability, decision] of Object.entries(capabilityInput)) {
        if (!isSandboxCapability(capability) || !isSandboxCapabilityDecision(decision)) {
          return null;
        }

        capabilities[capability] = decision;
      }
    }

    const policy: SandboxPolicy = {
      [sandboxPolicyBrand]: "sandbox_policy",
      capabilities: deepFreeze(capabilities),
      ...(input.quota ? { quota: input.quota } : {})
    };
    sandboxPolicies.add(policy);

    return deepFreeze(policy);
  } catch {
    return null;
  }
}

export function evaluateSandboxCapability(
  request: SandboxCapabilityEvaluationRequest
): SandboxCapabilityEvaluationResult {
  try {
    if (typeof request !== "object" || request === null) {
      return { decision: "DENIED", reason: "Sandbox policy evaluation request is required." };
    }

    if (!isSandboxPolicy(request.policy)) {
      return { decision: "DENIED", reason: "Sandbox policy is required." };
    }

    if (!isSandboxCapability(request.capability)) {
      return { decision: "DENIED", reason: "Sandbox capability is missing or unknown." };
    }

    if (request.identity !== undefined && !isExecutionIdentity(request.identity)) {
      return { decision: "DENIED", reason: "Sandbox identity binding is invalid." };
    }

    if (request.quota !== undefined && !isRuntimeResourceQuota(request.quota)) {
      return { decision: "DENIED", reason: "Runtime resource quota is malformed." };
    }

    const policyQuota = request.policy.quota;
    if (policyQuota !== undefined && !isRuntimeResourceQuota(policyQuota)) {
      return { decision: "DENIED", reason: "Sandbox policy quota is malformed." };
    }

    return request.policy.capabilities[request.capability] === "ALLOW"
      ? {
          decision: "ALLOWED",
          reason: "Sandbox capability is explicitly allowed.",
          capability: request.capability
        }
      : {
          decision: "DENIED",
          reason: "Sandbox capability is denied by default.",
          capability: request.capability
        };
  } catch {
    return { decision: "DENIED", reason: "Sandbox policy evaluation failed closed." };
  }
}

export function createSandboxProviderAttestation(
  input: SandboxProviderAttestationInput
): SandboxProviderAttestation | null {
  try {
    if (typeof input !== "object" || input === null) {
      return null;
    }

    const result = ownDataProperty(input, "result");
    const providerId = ownDataProperty(input, "providerId");
    const providerType = ownDataProperty(input, "providerType");
    const environmentMode = ownDataProperty(input, "environmentMode");
    const capabilitiesInput = ownDataProperty(input, "capabilities");
    const attestedAt = ownDataProperty(input, "attestedAt");
    if (
      !result.ok ||
      !providerId.ok ||
      !providerType.ok ||
      !environmentMode.ok ||
      !capabilitiesInput.ok ||
      !attestedAt.ok ||
      !isSandboxProviderAttestationResult(result.value) ||
      !isNonEmptyString(providerId.value) ||
      !isSandboxProviderType(providerType.value) ||
      !isSandboxEnvironmentMode(environmentMode.value) ||
      !providerTypeMatchesEnvironment(providerType.value, environmentMode.value) ||
      !isValidTimestamp(attestedAt.value)
    ) {
      return null;
    }

    const capabilities = normalizeSandboxCapabilities(capabilitiesInput.value);
    if (!capabilities) {
      return null;
    }

    const attestation: SandboxProviderAttestation = {
      [sandboxProviderAttestationBrand]: "sandbox_provider_attestation",
      result: result.value,
      providerId: providerId.value,
      providerType: providerType.value,
      environmentMode: environmentMode.value,
      capabilities,
      attestedAt: attestedAt.value
    };
    sandboxProviderAttestations.add(attestation);

    return deepFreeze(attestation);
  } catch {
    return null;
  }
}

export function createSandboxProvider(input: SandboxProviderInput): SandboxProvider | null {
  try {
    if (typeof input !== "object" || input === null) {
      return null;
    }

    const providerId = ownDataProperty(input, "providerId");
    const providerType = ownDataProperty(input, "providerType");
    const environmentMode = ownDataProperty(input, "environmentMode");
    const createdAt = ownDataProperty(input, "createdAt");
    const capabilitiesInput = ownDataProperty(input, "capabilities");
    const attestationInput = ownDataProperty(input, "attestation");
    if (
      !providerId.ok ||
      !providerType.ok ||
      !environmentMode.ok ||
      !createdAt.ok ||
      !capabilitiesInput.ok ||
      !attestationInput.ok ||
      !isNonEmptyString(providerId.value) ||
      !isSandboxProviderType(providerType.value) ||
      !isSandboxEnvironmentMode(environmentMode.value) ||
      !isValidTimestamp(createdAt.value) ||
      !providerTypeMatchesEnvironment(providerType.value, environmentMode.value)
    ) {
      return null;
    }

    const capabilities = normalizeSandboxCapabilities(capabilitiesInput.value);
    if (
      !capabilities ||
      !isSandboxProviderAttestation(attestationInput.value) ||
      !sandboxProviderAttestationMatches(
        attestationInput.value,
        providerId.value,
        providerType.value,
        environmentMode.value,
        capabilities
      )
    ) {
      return null;
    }

    const provider: SandboxProvider = {
      [sandboxProviderBrand]: "sandbox_provider",
      providerId: providerId.value,
      providerType: providerType.value,
      capabilities,
      attestation: attestationInput.value,
      environmentMode: environmentMode.value,
      createdAt: createdAt.value
    };
    sandboxProviders.add(provider);

    return deepFreeze(provider);
  } catch {
    return null;
  }
}

export function evaluateSandboxProvider(
  request: SandboxProviderEvaluationRequest
): SandboxProviderEvaluationResult {
  try {
    if (typeof request !== "object" || request === null) {
      return { decision: "DENIED", reason: "Sandbox provider evaluation request is required." };
    }

    if (!isSandboxEnvironmentMode(request.environmentMode)) {
      return { decision: "DENIED", reason: "Sandbox environment mode is malformed." };
    }

    if (!isSandboxProvider(request.provider)) {
      return { decision: "DENIED", reason: "Sandbox provider is required." };
    }

    const provider = request.provider;
    if (provider.environmentMode !== request.environmentMode) {
      return { decision: "DENIED", reason: "Sandbox provider environment mismatch." };
    }

    if (request.environmentMode === "production" && provider.providerType !== "productionDistributed") {
      return { decision: "DENIED", reason: "Production requires distributed sandbox provider." };
    }

    if (provider.attestation.result !== "TRUSTED") {
      return { decision: "DENIED", reason: "Sandbox provider attestation is not trusted." };
    }

    if (!isSandboxCapability(request.capability)) {
      return { decision: "DENIED", reason: "Sandbox capability is missing or unknown." };
    }

    const capability = request.capability;
    if (!provider.capabilities.includes(capability) || !provider.attestation.capabilities.includes(capability)) {
      return { decision: "DENIED", reason: "Sandbox provider does not support capability." };
    }

    const policyResult = evaluateSandboxCapability({
      policy: request.policy,
      capability,
      identity: request.identity,
      quota: request.quota
    });
    if (policyResult.decision !== "ALLOWED") {
      return { decision: "DENIED", reason: "Sandbox policy denied provider capability.", providerId: provider.providerId };
    }

    return {
      decision: "ALLOWED",
      reason: "Sandbox provider boundary is trusted and policy allowed capability.",
      providerId: provider.providerId,
      capability
    };
  } catch {
    return { decision: "DENIED", reason: "Sandbox provider evaluation failed closed." };
  }
}

export class InMemoryRuntimeIsolationStateStore implements RuntimeIsolationStateStore {
  readonly #state = new Map<string, Map<string, unknown>>();

  write(identity: ExecutionIdentity, key: string, value: unknown): RuntimeIsolationStateResult {
    if (!isExecutionIdentity(identity) || !isNonEmptyString(key)) {
      return { decision: "DENIED", reason: "Invalid state write request." };
    }

    const ownerKey = isolationKey(identity);
    const bucket = this.#state.get(ownerKey) ?? new Map<string, unknown>();
    bucket.set(key, value);
    this.#state.set(ownerKey, bucket);

    return { decision: "ALLOWED", reason: "State write is isolated to execution identity." };
  }

  read(owner: ExecutionIdentity, requester: ExecutionIdentity, key: string): RuntimeIsolationStateResult {
    if (!isExecutionIdentity(owner) || !isExecutionIdentity(requester) || !isNonEmptyString(key)) {
      return { decision: "DENIED", reason: "Invalid state read request." };
    }

    if (!sameExecutionIdentity(owner, requester)) {
      return {
        decision: "DENIED",
        reason: "State access denied across runtime isolation boundary."
      };
    }

    const value = this.#state.get(isolationKey(owner))?.get(key);
    return { decision: "ALLOWED", reason: "State read is isolated to execution identity.", value };
  }
}

export function createRuntimeIsolationContext(
  input: RuntimeIsolationContextInput
): RuntimeIsolationContext | null {
  try {
    const validation = validateRuntimeIsolationContextInput(input);
    return validation.valid ? validation.context ?? null : null;
  } catch {
    return null;
  }
}

export function createExecutionIdentity(context: RuntimeIsolationContext): ExecutionIdentity | null {
  if (!isRuntimeIsolationContext(context)) {
    return null;
  }

  const identity: ExecutionIdentity = {
    [executionIdentityBrand]: "execution_identity",
    chain: context
  };
  executionIdentities.add(identity);

  return deepFreeze(identity);
}

export function validateRuntimeIsolationBoundary(
  value: unknown,
  expected: RuntimeIsolationExpectedBinding = {}
): RuntimeIsolationValidationResult {
  try {
    if (!isRuntimeIsolationContext(value)) {
      return {
        valid: false,
        reason: "missing_identity",
        message: "Runtime isolation context is required."
      };
    }

    const malformed = validateRuntimeFields(value);
    if (malformed) {
      return malformed;
    }

    const mismatch = validateExpectedBinding(value, expected);
    if (mismatch) {
      return mismatch;
    }

    return {
      valid: true,
      message: "Runtime isolation context is valid.",
      context: value
    };
  } catch {
    return {
      valid: false,
      reason: "malformed_identity",
      message: "Runtime isolation validation failed closed."
    };
  }
}

export function evaluateIsolationBoundary(
  value: unknown,
  expected: RuntimeIsolationExpectedBinding = {}
): IsolationBoundaryDecision {
  const validation = validateRuntimeIsolationBoundary(value, expected);
  if (!validation.valid || !validation.context) {
    const decision: IsolationBoundaryDecision = {
      [isolationBoundaryDecisionBrand]: "isolation_boundary_decision",
      status: "DENIED",
      reason: validation.message
    };
    isolationBoundaryDecisions.add(decision);
    return deepFreeze(decision);
  }

  const identity = createExecutionIdentity(validation.context);
  if (!identity) {
    const decision: IsolationBoundaryDecision = {
      [isolationBoundaryDecisionBrand]: "isolation_boundary_decision",
      status: "DENIED",
      reason: "Execution identity could not be derived."
    };
    isolationBoundaryDecisions.add(decision);
    return deepFreeze(decision);
  }

  const decision: IsolationBoundaryDecision = {
    [isolationBoundaryDecisionBrand]: "isolation_boundary_decision",
    status: "ALLOWED",
    reason: "Runtime isolation boundary is valid.",
    identity
  };
  isolationBoundaryDecisions.add(decision);

  return deepFreeze(decision);
}

export function createRuntimeExecutionPermit(
  request: RuntimeExecutionPermitRequest
): RuntimeExecutionPermit | null {
  try {
    if (
      typeof request !== "object" ||
      request === null ||
      !isNonEmptyString(request.permitId) ||
      !isExecutionPermit(request.executionPermit) ||
      basePermitsWithRuntimePermit.has(request.executionPermit) ||
      !isIsolationBoundaryDecision(request.isolationDecision) ||
      request.isolationDecision.status !== "ALLOWED" ||
      !isExecutionIdentity(request.identity) ||
      !request.isolationDecision.identity ||
      !sameExecutionIdentity(request.isolationDecision.identity, request.identity) ||
      !isFuture(request.expiresAt, request.now) ||
      !isAtOrBefore(request.issuedAt, request.now)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  const permit: RuntimeExecutionPermit = {
    [runtimeExecutionPermitBrand]: "runtime_execution_permit",
    permitId: request.permitId,
    basePermit: request.executionPermit,
    identity: request.identity,
    issuedAt: request.issuedAt,
    expiresAt: request.expiresAt,
    oneTimeUse: true
  };
  runtimeExecutionPermits.add(permit);
  basePermitsWithRuntimePermit.add(request.executionPermit);

  return deepFreeze(permit);
}

export function consumeRuntimeExecutionPermit(
  permit: unknown,
  identity: unknown,
  now: string,
  replayProtection: ReplayProtectionProvider
): Promise<RuntimePermitConsumptionResult> | RuntimePermitConsumptionResult {
  return evaluateRuntimeExecutionGate({
    permit,
    identity,
    now,
    mode: replayProtection?.mode ?? "production",
    replayProtection
  });
}

export async function evaluateRuntimeExecutionGate(
  request: RuntimeExecutionGateRequest
): Promise<RuntimePermitConsumptionResult> {
  try {
    if (
      typeof request !== "object" ||
      request === null ||
      (request.mode === "production" && !request.replayProtection) ||
      !request.replayProtection ||
      !isReplayProtectionProvider(request.replayProtection) ||
      request.replayProtection.mode !== request.mode ||
      (request.mode === "production" && request.replayProtection.store.testOnly === true)
    ) {
      return { decision: "DENIED", reason: "Replay protection provider is required." };
    }

    const permit = request.permit;
    const identity = request.identity;
    const now = request.now;

    if (!isRuntimeExecutionPermit(permit) || !isExecutionIdentity(identity)) {
      return { decision: "DENIED", reason: "Runtime execution permit is invalid." };
    }

    if (!isFuture(permit.expiresAt, now)) {
      return { decision: "DENIED", reason: "Runtime execution permit is expired." };
    }

    if (!sameExecutionIdentity(permit.identity, identity)) {
      return { decision: "DENIED", reason: "Runtime execution permit identity mismatch." };
    }

    if (consumedRuntimeExecutionPermitObjects.has(permit)) {
      return { decision: "DENIED", reason: "Runtime execution permit has already been consumed." };
    }

    consumedRuntimeExecutionPermitObjects.add(permit);
    const replayResult = await request.replayProtection.store.claim({
      key: replayKeyFor(permit),
      issuedAt: permit.issuedAt,
      expiresAt: permit.expiresAt,
      claimedAt: now
    });
    if (!isReplayProtectionResult(replayResult)) {
      return { decision: "DENIED", reason: "Replay protection provider returned malformed result." };
    }

    if (replayResult.decision !== "ALLOWED") {
      return replayResult;
    }

    return { decision: "ALLOWED", reason: "Runtime execution permit consumed." };
  } catch {
    return { decision: "DENIED", reason: "Runtime execution permit consumption failed closed." };
  }
}

export function isRuntimeIsolationContext(value: unknown): value is RuntimeIsolationContext {
  return (
    typeof value === "object" &&
    value !== null &&
    runtimeIsolationContexts.has(value) &&
    runtimeIsolationContextBrand in value &&
    (value as RuntimeIsolationContext)[runtimeIsolationContextBrand] === "runtime_isolation_context"
  );
}

export function isExecutionIdentity(value: unknown): value is ExecutionIdentity {
  return (
    typeof value === "object" &&
    value !== null &&
    executionIdentities.has(value) &&
    executionIdentityBrand in value &&
    (value as ExecutionIdentity)[executionIdentityBrand] === "execution_identity" &&
    isRuntimeIsolationContext((value as ExecutionIdentity).chain)
  );
}

export function isIsolationBoundaryDecision(value: unknown): value is IsolationBoundaryDecision {
  return (
    typeof value === "object" &&
    value !== null &&
    isolationBoundaryDecisions.has(value) &&
    isolationBoundaryDecisionBrand in value &&
    (value as IsolationBoundaryDecision)[isolationBoundaryDecisionBrand] === "isolation_boundary_decision"
  );
}

export function isRuntimeExecutionPermit(value: unknown): value is RuntimeExecutionPermit {
  return (
    typeof value === "object" &&
    value !== null &&
    runtimeExecutionPermits.has(value) &&
    runtimeExecutionPermitBrand in value &&
    (value as RuntimeExecutionPermit)[runtimeExecutionPermitBrand] === "runtime_execution_permit" &&
    isExecutionPermit((value as RuntimeExecutionPermit).basePermit) &&
    isExecutionIdentity((value as RuntimeExecutionPermit).identity)
  );
}

export function isReplayProtectionProvider(value: unknown): value is ReplayProtectionProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    replayProtectionProviders.has(value) &&
    replayProtectionProviderBrand in value &&
    (value as ReplayProtectionProvider)[replayProtectionProviderBrand] === "replay_protection_provider" &&
    isReplayProtectionStore((value as ReplayProtectionProvider).store) &&
    ((value as ReplayProtectionProvider).mode === "test" ||
      ((value as ReplayProtectionProvider).mode === "production" &&
        isDistributedReplayProtectionStore((value as ReplayProtectionProvider).store)))
  );
}

export function isRuntimeResourceQuota(value: unknown): value is RuntimeResourceQuota {
  return (
    typeof value === "object" &&
    value !== null &&
    runtimeResourceQuotas.has(value) &&
    runtimeResourceQuotaBrand in value &&
    (value as RuntimeResourceQuota)[runtimeResourceQuotaBrand] === "runtime_resource_quota" &&
    isPositiveInteger((value as RuntimeResourceQuota).maxCpuTimeMs) &&
    isPositiveInteger((value as RuntimeResourceQuota).maxMemoryBytes) &&
    isPositiveInteger((value as RuntimeResourceQuota).maxExecutionTimeMs) &&
    isPositiveInteger((value as RuntimeResourceQuota).maxProcesses)
  );
}

export function isSandboxPolicy(value: unknown): value is SandboxPolicy {
  return (
    typeof value === "object" &&
    value !== null &&
    sandboxPolicies.has(value) &&
    sandboxPolicyBrand in value &&
    (value as SandboxPolicy)[sandboxPolicyBrand] === "sandbox_policy" &&
    isSandboxCapabilitySet((value as SandboxPolicy).capabilities) &&
    ((value as SandboxPolicy).quota === undefined || isRuntimeResourceQuota((value as SandboxPolicy).quota))
  );
}

export function isSandboxProvider(value: unknown): value is SandboxProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    sandboxProviders.has(value) &&
    sandboxProviderBrand in value &&
    (value as SandboxProvider)[sandboxProviderBrand] === "sandbox_provider" &&
    isNonEmptyString((value as SandboxProvider).providerId) &&
    isSandboxProviderType((value as SandboxProvider).providerType) &&
    isSandboxEnvironmentMode((value as SandboxProvider).environmentMode) &&
    isValidTimestamp((value as SandboxProvider).createdAt) &&
    providerTypeMatchesEnvironment(
      (value as SandboxProvider).providerType,
      (value as SandboxProvider).environmentMode
    ) &&
    isSandboxCapabilityArray((value as SandboxProvider).capabilities) &&
    isSandboxProviderAttestation((value as SandboxProvider).attestation) &&
    sandboxProviderAttestationMatches(
      (value as SandboxProvider).attestation,
      (value as SandboxProvider).providerId,
      (value as SandboxProvider).providerType,
      (value as SandboxProvider).environmentMode,
      (value as SandboxProvider).capabilities
    )
  );
}

function validateRuntimeIsolationContextInput(
  input: RuntimeIsolationContextInput
): RuntimeIsolationValidationResult {
  if (typeof input !== "object" || input === null) {
    return {
      valid: false,
      reason: "missing_identity",
      message: "Runtime isolation context input is required."
    };
  }

  const contextValidation = validateOSForgeContext(input.context);
  if (!contextValidation.valid) {
    return {
      valid: false,
      reason: "malformed_identity",
      message: "OSForge context is invalid for runtime isolation."
    };
  }

  const runtimeContext: RuntimeIsolationContext = {
    [runtimeIsolationContextBrand]: "runtime_isolation_context",
    tenantId: input.context.tenant.id,
    organizationId: input.context.organization.id,
    workspaceId: input.context.workspace.id,
    actorId: input.context.actor.id,
    actorType: input.context.actor.type,
    executionId: input.executionId,
    correlationId: input.context.correlationId
  };
  runtimeIsolationContexts.add(runtimeContext);

  const malformed = validateRuntimeFields(runtimeContext);
  if (malformed) {
    return malformed;
  }

  return {
    valid: true,
    message: "Runtime isolation context input is valid.",
    context: deepFreeze(runtimeContext)
  };
}

function validateRuntimeFields(context: RuntimeIsolationContext): RuntimeIsolationValidationResult | null {
  const fields = [
    context.tenantId,
    context.organizationId,
    context.workspaceId,
    context.actorId,
    context.actorType,
    context.executionId,
    context.correlationId
  ];

  if (!fields.every(isNonEmptyString)) {
    return {
      valid: false,
      reason: "malformed_identity",
      message: "Runtime isolation identity fields must be non-empty strings."
    };
  }

  if (!isRuntimeActorType(context.actorType)) {
    return {
      valid: false,
      reason: "malformed_identity",
      message: "Runtime actor type is not supported."
    };
  }

  return null;
}

function validateExpectedBinding(
  context: RuntimeIsolationContext,
  expected: RuntimeIsolationExpectedBinding
): RuntimeIsolationValidationResult | null {
  if (expected.tenantId !== undefined && context.tenantId !== expected.tenantId) {
    return { valid: false, reason: "cross_tenant_mismatch", message: "Tenant boundary mismatch." };
  }

  if (expected.organizationId !== undefined && context.organizationId !== expected.organizationId) {
    return {
      valid: false,
      reason: "cross_organization_mismatch",
      message: "Organization boundary mismatch."
    };
  }

  if (expected.workspaceId !== undefined && context.workspaceId !== expected.workspaceId) {
    return { valid: false, reason: "cross_workspace_mismatch", message: "Workspace boundary mismatch." };
  }

  if (expected.actorId !== undefined && context.actorId !== expected.actorId) {
    return { valid: false, reason: "actor_mismatch", message: "Actor boundary mismatch." };
  }

  if (expected.actorType !== undefined && context.actorType !== expected.actorType) {
    return { valid: false, reason: "actor_type_mismatch", message: "Actor type boundary mismatch." };
  }

  if (expected.executionId !== undefined && context.executionId !== expected.executionId) {
    return { valid: false, reason: "execution_mismatch", message: "Execution boundary mismatch." };
  }

  return null;
}

function sameExecutionIdentity(left: ExecutionIdentity, right: ExecutionIdentity): boolean {
  return isolationKey(left) === isolationKey(right);
}

function replayKeyFor(permit: RuntimeExecutionPermit): ReplayProtectionKey {
  const chain = permit.identity.chain;
  return {
    permitId: permit.permitId,
    tenantId: chain.tenantId,
    organizationId: chain.organizationId,
    workspaceId: chain.workspaceId,
    actorId: chain.actorId,
    actorType: chain.actorType,
    executionId: chain.executionId
  };
}

function isReplayProtectionClaim(value: unknown): value is ReplayProtectionClaim {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const claim = value as ReplayProtectionClaim;
  const key = claim.key;
  return (
    typeof key === "object" &&
    key !== null &&
    [
      key.permitId,
      key.tenantId,
      key.organizationId,
      key.workspaceId,
      key.actorId,
      key.actorType,
      key.executionId,
      claim.issuedAt,
      claim.expiresAt,
      claim.claimedAt
    ].every(isNonEmptyString) &&
    isRuntimeActorType(key.actorType)
  );
}

function isReplayProtectionResult(value: unknown): value is ReplayProtectionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as ReplayProtectionResult).decision === "ALLOWED" ||
      (value as ReplayProtectionResult).decision === "DENIED") &&
    isNonEmptyString((value as ReplayProtectionResult).reason)
  );
}

function isReplayProtectionStore(value: unknown): value is ReplayProtectionStore {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReplayProtectionStore).claim === "function"
  );
}

function isDistributedReplayProtectionStore(value: unknown): value is DistributedReplayProtectionStore {
  return (
    isReplayProtectionStore(value) &&
    value.testOnly !== true &&
    (value as DistributedReplayProtectionStore).providerType === "distributed" &&
    isNonEmptyString((value as DistributedReplayProtectionStore).providerName) &&
    (value as DistributedReplayProtectionStore).requiresAtomicClaim === true
  );
}

function defaultSandboxCapabilities(): Record<SandboxCapability, SandboxCapabilityDecision> {
  return {
    filesystemRead: "DENY",
    filesystemWrite: "DENY",
    networkEgress: "DENY",
    shell: "DENY",
    childProcess: "DENY",
    container: "DENY",
    tool: "DENY",
    mcp: "DENY"
  };
}

function isSandboxCapability(value: unknown): value is SandboxCapability {
  return typeof value === "string" && (SANDBOX_CAPABILITIES as readonly string[]).includes(value);
}

function isSandboxCapabilityDecision(value: unknown): value is SandboxCapabilityDecision {
  return value === "ALLOW" || value === "DENY";
}

function isSandboxProviderType(value: unknown): value is SandboxProviderType {
  return value === "testOnly" || value === "localDevelopment" || value === "productionDistributed";
}

function isSandboxProviderAttestationResult(value: unknown): value is SandboxProviderAttestationResult {
  return value === "TRUSTED" || value === "UNTRUSTED" || value === "UNKNOWN";
}

function isSandboxEnvironmentMode(value: unknown): value is SandboxEnvironmentMode {
  return value === "test" || value === "development" || value === "staging" || value === "production";
}

function providerTypeMatchesEnvironment(
  providerType: SandboxProviderType,
  environmentMode: SandboxEnvironmentMode
): boolean {
  if (providerType === "testOnly") {
    return environmentMode === "test";
  }

  if (providerType === "localDevelopment") {
    return environmentMode === "development";
  }

  return environmentMode === "staging" || environmentMode === "production";
}

function isSandboxCapabilitySet(value: unknown): value is SandboxCapabilitySet {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const capabilities = value as Record<SandboxCapability, unknown>;
  return SANDBOX_CAPABILITIES.every((capability) =>
    isSandboxCapabilityDecision(capabilities[capability])
  );
}

function isSandboxCapabilityArray(value: unknown): value is readonly SandboxCapability[] {
  return (
    Array.isArray(value) &&
    value.every(isSandboxCapability) &&
    new Set(value).size === value.length
  );
}

function normalizeSandboxCapabilities(value: unknown): readonly SandboxCapability[] | null {
  if (!isSandboxCapabilityArray(value)) {
    return null;
  }

  return deepFreeze([...value]);
}

function isSandboxProviderAttestation(value: unknown): value is SandboxProviderAttestation {
  return (
    typeof value === "object" &&
    value !== null &&
    sandboxProviderAttestations.has(value) &&
    sandboxProviderAttestationBrand in value &&
    (value as SandboxProviderAttestation)[sandboxProviderAttestationBrand] === "sandbox_provider_attestation" &&
    isSandboxProviderAttestationResult((value as SandboxProviderAttestation).result) &&
    isNonEmptyString((value as SandboxProviderAttestation).providerId) &&
    isSandboxProviderType((value as SandboxProviderAttestation).providerType) &&
    isSandboxEnvironmentMode((value as SandboxProviderAttestation).environmentMode) &&
    providerTypeMatchesEnvironment(
      (value as SandboxProviderAttestation).providerType,
      (value as SandboxProviderAttestation).environmentMode
    ) &&
    isSandboxCapabilityArray((value as SandboxProviderAttestation).capabilities) &&
    isValidTimestamp((value as SandboxProviderAttestation).attestedAt)
  );
}

function sandboxProviderAttestationMatches(
  attestation: SandboxProviderAttestation,
  providerId: string,
  providerType: SandboxProviderType,
  environmentMode: SandboxEnvironmentMode,
  capabilities: readonly SandboxCapability[]
): boolean {
  return (
    attestation.providerId === providerId &&
    attestation.providerType === providerType &&
    attestation.environmentMode === environmentMode &&
    sameCapabilityList(capabilities, attestation.capabilities)
  );
}

function sameCapabilityList(left: readonly SandboxCapability[], right: readonly SandboxCapability[]): boolean {
  return left.length === right.length && left.every((capability) => right.includes(capability));
}

function snapshotReplayProtectionStore(
  mode: RuntimeExecutionMode,
  store: ReplayProtectionStore
): ReplayProtectionStore | DistributedReplayProtectionStore | null {
  if (!isReplayProtectionStore(store)) {
    return null;
  }

  Object.freeze(store);
  const claim = store.claim.bind(store);

  if (mode === "test") {
    return deepFreeze({
      testOnly: store.testOnly === true ? true : undefined,
      claim
    });
  }

  if (!isDistributedReplayProtectionStore(store)) {
    return null;
  }

  return deepFreeze({
    providerType: "distributed",
    providerName: store.providerName,
    requiresAtomicClaim: true,
    claim
  });
}

function sameReplayKey(left: ReplayProtectionKey, right: ReplayProtectionKey): boolean {
  return (
    left.permitId === right.permitId &&
    left.tenantId === right.tenantId &&
    left.organizationId === right.organizationId &&
    left.workspaceId === right.workspaceId &&
    left.actorId === right.actorId &&
    left.actorType === right.actorType &&
    left.executionId === right.executionId
  );
}

function isolationKey(identity: ExecutionIdentity): string {
  const chain = identity.chain;
  return [
    chain.tenantId,
    chain.organizationId,
    chain.workspaceId,
    chain.actorId,
    chain.actorType,
    chain.executionId
  ].join("\u001f");
}

function isRuntimeActorType(value: unknown): value is RuntimeActorType {
  return (
    value === "human_user" ||
    value === "digital_employee" ||
    value === "system" ||
    value === "external_service" ||
    value === "ai_agent"
  );
}

function isFuture(value: string, now: string): boolean {
  const valueTime = Date.parse(value);
  const nowTime = Date.parse(now);
  return Number.isFinite(valueTime) && Number.isFinite(nowTime) && valueTime > nowTime;
}

function isAtOrBefore(value: string, now: string): boolean {
  const valueTime = Date.parse(value);
  const nowTime = Date.parse(now);
  return Number.isFinite(valueTime) && Number.isFinite(nowTime) && valueTime <= nowTime;
}

function isValidTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function ownDataProperty(
  value: object,
  property: string
): { ok: true; value: unknown } | { ok: false } {
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  if (!descriptor || !("value" in descriptor)) {
    return { ok: false };
  }

  return { ok: true, value: descriptor.value };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function deepFreeze<T extends object>(value: T): T {
  Object.freeze(value);

  for (const nested of Object.values(value)) {
    if (typeof nested === "object" && nested !== null && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }

  return value;
}
