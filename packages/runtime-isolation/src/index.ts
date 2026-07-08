import type { ActorType, OSForgeContext } from "#protocol";
import { validateOSForgeContext } from "#protocol";
import { isExecutionPermit, type ExecutionPermit } from "#policy";

const runtimeIsolationContextBrand: unique symbol = Symbol("runtime_isolation_context");
const executionIdentityBrand: unique symbol = Symbol("execution_identity");
const isolationBoundaryDecisionBrand: unique symbol = Symbol("isolation_boundary_decision");
const runtimeExecutionPermitBrand: unique symbol = Symbol("runtime_execution_permit");
const replayProtectionProviderBrand: unique symbol = Symbol("replay_protection_provider");
const runtimeIsolationContexts = new WeakSet<object>();
const executionIdentities = new WeakSet<object>();
const isolationBoundaryDecisions = new WeakSet<object>();
const runtimeExecutionPermits = new WeakSet<object>();
const basePermitsWithRuntimePermit = new WeakSet<object>();
const consumedRuntimeExecutionPermitObjects = new WeakSet<object>();
const replayProtectionProviders = new WeakSet<object>();

export type RuntimeActorType = ActorType | "ai_agent";

export type IsolationDecisionStatus = "ALLOWED" | "DENIED";

export type RuntimeExecutionMode = "test" | "production";

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
