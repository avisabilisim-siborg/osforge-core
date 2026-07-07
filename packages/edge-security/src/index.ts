import type { OSForgeContext } from "#protocol";
import { validateOSForgeContext } from "#protocol";

const rawRequestBrand: unique symbol = Symbol("raw_edge_request");
const validatedRequestBrand: unique symbol = Symbol("validated_edge_request");
const coreIngressBrand: unique symbol = Symbol("core_ingress_request");

export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

export type EndpointActionClass =
  | "standard"
  | "authentication"
  | "admin"
  | "recovery"
  | "payment"
  | "secret_management"
  | "tool_execution"
  | "workflow_execution";

export type EdgeDecision = "ALLOW" | "CHALLENGE" | "DENY";

export type EdgeRejectionReason =
  | "malformed_request"
  | "payload_exceeded"
  | "rate_limited"
  | "abuse_detected"
  | "authentication_missing"
  | "context_mismatch"
  | "edge_gate_failure";

export interface RawEdgeRequest {
  readonly [rawRequestBrand]: "raw_edge_request";
  readonly method: unknown;
  readonly path: unknown;
  readonly headers: unknown;
  readonly query?: unknown;
  readonly bodySizeBytes?: unknown;
  readonly authentication?: AuthenticationContext;
  readonly context?: OSForgeContext;
  readonly actionClass: EndpointActionClass;
}

export interface AuthenticationContext {
  subjectId: string;
  tenantId: string;
  actorId?: string;
  mfaSatisfied: boolean;
  authenticatedAt: string;
}

export interface NormalizedEdgeRequest {
  method: HttpMethod;
  path: string;
  headers: ReadonlyMap<string, string>;
  query: ReadonlyMap<string, string>;
  bodySizeBytes: number;
  actionClass: EndpointActionClass;
}

export interface ValidatedEdgeRequest {
  readonly [validatedRequestBrand]: "validated_edge_request";
  readonly request: NormalizedEdgeRequest;
  readonly authentication: AuthenticationContext;
  readonly context: OSForgeContext;
}

export interface CoreIngressRequest {
  readonly [coreIngressBrand]: "core_ingress_request";
  readonly edgeRequest: ValidatedEdgeRequest;
}

export interface PayloadLimitPolicy {
  maxBodyBytes: number;
  maxHeaderCount: number;
  maxHeaderBytes: number;
  maxQueryParams: number;
  maxPathLength: number;
}

export interface RateLimitSubject {
  tenantId: string;
  actorId?: string;
  workspaceId?: string;
  networkFingerprint: string;
  actionClass: EndpointActionClass;
}

export type RateLimitDecision = "ALLOW" | "DENY";

export interface RateLimitResult {
  decision: RateLimitDecision;
  reason: string;
}

export interface RateLimitAdapter {
  check(subject: RateLimitSubject): Promise<RateLimitResult> | RateLimitResult;
}

export type AbuseDetectionDecision = "ALLOW" | "CHALLENGE" | "DENY" | "UNKNOWN";

export interface AbuseDetectionRequest {
  request: NormalizedEdgeRequest;
  authentication?: AuthenticationContext;
  networkFingerprint: string;
}

export interface AbuseDetectionResult {
  decision: AbuseDetectionDecision;
  reason: string;
}

export interface AbuseDetectionAdapter {
  analyze(request: AbuseDetectionRequest): Promise<AbuseDetectionResult> | AbuseDetectionResult;
}

export interface NetworkFingerprintAdapter {
  fingerprint(request: NormalizedEdgeRequest): string;
}

export interface EdgeSecurityPolicy {
  payloadLimits: PayloadLimitPolicy;
  criticalActionClasses: readonly EndpointActionClass[];
}

export interface EdgeSecurityGateRequest {
  rawRequest: RawEdgeRequest;
  policy: EdgeSecurityPolicy;
  rateLimit: RateLimitAdapter;
  abuseDetection: AbuseDetectionAdapter;
  networkFingerprint: NetworkFingerprintAdapter;
}

export interface EdgeSecurityGateResult {
  decision: EdgeDecision;
  validatedRequest?: ValidatedEdgeRequest;
  rejectionReason?: EdgeRejectionReason;
  securityEvents: EdgeSecurityEvent[];
}

export type EdgeSecurityEventName =
  | "edge.request_rejected"
  | "edge.rate_limited"
  | "edge.abuse_detected"
  | "edge.malformed_request"
  | "edge.payload_exceeded"
  | "edge.context_mismatch"
  | "edge.gate_failure";

export interface EdgeSecurityEvent {
  name: EdgeSecurityEventName;
  reason: string;
  actionClass?: EndpointActionClass;
}

export function createRawEdgeRequest(input: Omit<RawEdgeRequest, typeof rawRequestBrand>): RawEdgeRequest {
  return {
    [rawRequestBrand]: "raw_edge_request",
    ...input
  };
}

export async function evaluateEdgeSecurityGate(
  request: EdgeSecurityGateRequest
): Promise<EdgeSecurityGateResult> {
  if (!isRawEdgeRequest(request.rawRequest)) {
    return reject("malformed_request", "Raw request is not trusted edge input.");
  }

  const normalized = normalizeRequest(request.rawRequest, request.policy.payloadLimits);
  if (!normalized.ok) {
    return reject(normalized.reason, normalized.message, request.rawRequest.actionClass);
  }

  let networkFingerprint: string;
  try {
    networkFingerprint = request.networkFingerprint.fingerprint(normalized.request);
  } catch {
    return reject("edge_gate_failure", "Network fingerprint adapter failed.", normalized.request.actionClass);
  }

  if (!isNonEmptyString(networkFingerprint)) {
    return reject("edge_gate_failure", "Network fingerprint adapter returned an invalid value.", normalized.request.actionClass);
  }

  let rateLimit: RateLimitResult;
  try {
    rateLimit = await request.rateLimit.check({
      tenantId: safeAuthenticationTenantId(request.rawRequest.authentication),
      actorId: safeAuthenticationActorId(request.rawRequest.authentication),
      workspaceId: safeWorkspaceId(request.rawRequest.context),
      networkFingerprint,
      actionClass: normalized.request.actionClass
    });
  } catch {
    return reject("edge_gate_failure", "Rate-limit adapter failed.", normalized.request.actionClass);
  }

  if (rateLimit.decision !== "ALLOW") {
    return reject("rate_limited", rateLimit.reason, normalized.request.actionClass);
  }

  try {
    const abuse = await request.abuseDetection.analyze({
      request: normalized.request,
      authentication: request.rawRequest.authentication,
      networkFingerprint
    });

    if (abuse.decision === "DENY") {
      return reject("abuse_detected", abuse.reason, normalized.request.actionClass);
    }

    if (abuse.decision === "CHALLENGE") {
      return {
        decision: "CHALLENGE",
        rejectionReason: "abuse_detected",
        securityEvents: [
          {
            name: "edge.abuse_detected",
            reason: abuse.reason,
            actionClass: normalized.request.actionClass
          }
        ]
      };
    }

    if (abuse.decision === "UNKNOWN") {
      return reject("abuse_detected", "Abuse detection was ambiguous.", normalized.request.actionClass);
    }
  } catch {
    return reject("abuse_detected", "Abuse detection adapter failed.", normalized.request.actionClass);
  }

  if (!isAuthenticationContext(request.rawRequest.authentication)) {
    return reject("authentication_missing", "Authentication context is required.", normalized.request.actionClass);
  }

  const contextValidation = validateOSForgeContext(request.rawRequest.context);
  if (!contextValidation.valid) {
    return reject("context_mismatch", "Tenant/workspace context validation failed.", normalized.request.actionClass);
  }

  const context = request.rawRequest.context;
  if (!context) {
    return reject("context_mismatch", "Tenant/workspace context is required.", normalized.request.actionClass);
  }

  if (request.rawRequest.authentication.tenantId !== context.tenant.id) {
    return reject("context_mismatch", "Authentication tenant does not match request context.", normalized.request.actionClass);
  }

  return {
    decision: "ALLOW",
    validatedRequest: {
      [validatedRequestBrand]: "validated_edge_request",
      request: normalized.request,
      authentication: request.rawRequest.authentication,
      context
    },
    securityEvents: []
  };
}

export function createCoreIngressRequest(value: ValidatedEdgeRequest): CoreIngressRequest | null {
  if (!isValidatedEdgeRequest(value)) {
    return null;
  }

  return {
    [coreIngressBrand]: "core_ingress_request",
    edgeRequest: value
  };
}

export function isValidatedEdgeRequest(value: unknown): value is ValidatedEdgeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    validatedRequestBrand in value &&
    (value as ValidatedEdgeRequest)[validatedRequestBrand] === "validated_edge_request"
  );
}

function isRawEdgeRequest(value: unknown): value is RawEdgeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    rawRequestBrand in value &&
    (value as RawEdgeRequest)[rawRequestBrand] === "raw_edge_request"
  );
}

type NormalizeResult =
  | { ok: true; request: NormalizedEdgeRequest }
  | { ok: false; reason: EdgeRejectionReason; message: string };

function normalizeRequest(raw: RawEdgeRequest, limits: PayloadLimitPolicy): NormalizeResult {
  if (!isNonEmptyString(raw.method) || !isNonEmptyString(raw.path)) {
    return { ok: false, reason: "malformed_request", message: "Method and path are required." };
  }

  const method = raw.method.trim().toUpperCase();
  if (!isHttpMethod(method)) {
    return { ok: false, reason: "malformed_request", message: "Unsupported HTTP method." };
  }

  if (!isEndpointActionClass(raw.actionClass)) {
    return { ok: false, reason: "malformed_request", message: "Unsupported endpoint action class." };
  }

  const path = normalizePath(raw.path);
  if (!path || path.length > limits.maxPathLength) {
    return { ok: false, reason: "payload_exceeded", message: "Path length exceeded." };
  }

  const bodySizeBytes = Number(raw.bodySizeBytes ?? 0);
  if (!Number.isSafeInteger(bodySizeBytes) || bodySizeBytes < 0 || bodySizeBytes > limits.maxBodyBytes) {
    return { ok: false, reason: "payload_exceeded", message: "Body size exceeded." };
  }

  const headers = normalizeStringMap(raw.headers, {
    maxEntries: limits.maxHeaderCount,
    maxValueBytes: limits.maxHeaderBytes,
    rejectDuplicateKeys: true
  });
  if (!headers.ok) {
    return { ok: false, reason: headers.reason, message: headers.message };
  }

  const query = normalizeStringMap(raw.query ?? {}, {
    maxEntries: limits.maxQueryParams,
    maxValueBytes: limits.maxHeaderBytes,
    rejectDuplicateKeys: true
  });
  if (!query.ok) {
    return { ok: false, reason: query.reason, message: query.message };
  }

  return {
    ok: true,
    request: {
      method,
      path,
      headers: headers.map,
      query: query.map,
      bodySizeBytes,
      actionClass: raw.actionClass
    }
  };
}

function normalizePath(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.includes("\\")) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded !== trimmed || decoded.includes("//") || decoded.includes("..")) {
      return null;
    }

    return decoded.replace(/\/+$/u, "") || "/";
  } catch {
    return null;
  }
}

interface NormalizeMapOptions {
  maxEntries: number;
  maxValueBytes: number;
  rejectDuplicateKeys: boolean;
}

type NormalizeMapResult =
  | { ok: true; map: ReadonlyMap<string, string> }
  | { ok: false; reason: EdgeRejectionReason; message: string };

function normalizeStringMap(input: unknown, options: NormalizeMapOptions): NormalizeMapResult {
  const entries = Array.isArray(input)
    ? input
    : isRecord(input)
      ? Object.entries(input)
      : undefined;

  if (!entries) {
    return { ok: false, reason: "malformed_request", message: "Expected object or entries." };
  }

  if (entries.length > options.maxEntries) {
    return { ok: false, reason: "payload_exceeded", message: "Too many entries." };
  }

  const seen = new Set<string>();
  const map = new Map<string, string>();

  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return { ok: false, reason: "malformed_request", message: "Malformed entry." };
    }

    const [rawKey, rawValue] = entry;
    if (!isNonEmptyString(rawKey) || typeof rawValue !== "string") {
      return { ok: false, reason: "malformed_request", message: "Malformed key or value." };
    }

    const key = rawKey.trim().toLowerCase();
    if (options.rejectDuplicateKeys && seen.has(key)) {
      return { ok: false, reason: "malformed_request", message: "Duplicate ambiguous input." };
    }

    if (byteLength(rawValue) > options.maxValueBytes) {
      return { ok: false, reason: "payload_exceeded", message: "Entry value too large." };
    }

    seen.add(key);
    map.set(key, rawValue.trim());
  }

  return { ok: true, map };
}

function reject(
  reason: EdgeRejectionReason,
  message: string,
  actionClass?: EndpointActionClass
): EdgeSecurityGateResult {
  return {
    decision: "DENY",
    rejectionReason: reason,
    securityEvents: [
      {
        name: eventNameFor(reason),
        reason: message,
        actionClass
      }
    ]
  };
}

function eventNameFor(reason: EdgeRejectionReason): EdgeSecurityEventName {
  switch (reason) {
    case "payload_exceeded":
      return "edge.payload_exceeded";
    case "rate_limited":
      return "edge.rate_limited";
    case "abuse_detected":
      return "edge.abuse_detected";
    case "malformed_request":
      return "edge.malformed_request";
    case "context_mismatch":
      return "edge.context_mismatch";
    case "edge_gate_failure":
      return "edge.gate_failure";
    case "authentication_missing":
      return "edge.request_rejected";
  }
}

function isHttpMethod(method: string): method is HttpMethod {
  return ["DELETE", "GET", "PATCH", "POST", "PUT"].includes(method);
}

function isEndpointActionClass(actionClass: unknown): actionClass is EndpointActionClass {
  return (
    actionClass === "standard" ||
    actionClass === "authentication" ||
    actionClass === "admin" ||
    actionClass === "recovery" ||
    actionClass === "payment" ||
    actionClass === "secret_management" ||
    actionClass === "tool_execution" ||
    actionClass === "workflow_execution"
  );
}

function isAuthenticationContext(value: unknown): value is AuthenticationContext {
  return (
    isRecord(value) &&
    isNonEmptyString(value.subjectId) &&
    isNonEmptyString(value.tenantId) &&
    (value.actorId === undefined || isNonEmptyString(value.actorId)) &&
    typeof value.mfaSatisfied === "boolean" &&
    isNonEmptyString(value.authenticatedAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeAuthenticationTenantId(authentication: AuthenticationContext | undefined): string {
  return isNonEmptyString(authentication?.tenantId) ? authentication.tenantId : "anonymous";
}

function safeAuthenticationActorId(authentication: AuthenticationContext | undefined): string | undefined {
  return isNonEmptyString(authentication?.actorId) ? authentication.actorId : undefined;
}

function safeWorkspaceId(context: OSForgeContext | undefined): string | undefined {
  return isRecord(context?.workspace) && typeof context.workspace.id === "string"
    ? context.workspace.id
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
