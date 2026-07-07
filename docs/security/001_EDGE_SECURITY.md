# Edge Security

Edge Security is the mandatory security boundary in front of OSForge Core.

No untrusted request may reach kernel, policy, approval, workflow, tool execution or agent runtime directly.

## Mandatory Edge Chain

Every external request must pass through:

1. Untrusted Request
2. Edge Security Boundary
3. Request Normalization
4. Payload Limits
5. Rate Limit
6. Abuse/Bot Detection Contract
7. Authentication Context Check
8. Tenant/Workspace Context Validation
9. Policy Engine
10. Approval Engine
11. Execution Gate
12. Audit Event
13. Core

Any failure, timeout, exception or ambiguity must fail closed.

## Request Branding

Raw requests and validated requests are different branded types:

- `RawEdgeRequest`
- `ValidatedEdgeRequest`
- `CoreIngressRequest`

Raw input cannot become core input without `evaluateEdgeSecurityGate`.

`ValidatedEdgeRequest` does not grant execution. It only proves that the request passed the edge boundary. Execution permission can only come from the existing `ExecutionGate` and `ExecutionPermit` path.

## Normalization

The edge gate normalizes:

- HTTP method.
- Path.
- Headers.
- Query parameters.

Malformed, duplicate or ambiguous input is rejected.

Encoded path ambiguity, traversal markers and duplicate header names are rejected.

## Payload Limits

The edge gate enforces:

- Maximum body size.
- Maximum header count.
- Maximum header value size.
- Maximum query parameter count.
- Maximum path length.

Limit violations are `DENY`, not warnings.

## Rate Limit

Rate limiting is expressed through a vendor-neutral adapter boundary.

Rate-limit subjects include:

- Tenant.
- Actor.
- Workspace.
- Network fingerprint.
- Endpoint/action class.

The core must not depend directly on a vendor-specific rate-limit service.

## Abuse and Bot Detection

Abuse detection is expressed through a vendor-neutral adapter.

Results:

- `ALLOW`
- `CHALLENGE`
- `DENY`
- `UNKNOWN`

`UNKNOWN` results and adapter errors are always treated as `DENY`.

Critical endpoint classes are explicitly identified so later policies can apply stricter thresholds, lower limits and stronger challenges without changing core contracts.

Critical endpoint classes:

- Authentication.
- Admin.
- Recovery.
- Payment.
- Secret management.
- Tool execution.
- Workflow execution.

## Security Events

The edge layer emits security events without logging secrets or sensitive payloads:

- `edge.request_rejected`
- `edge.rate_limited`
- `edge.abuse_detected`
- `edge.malformed_request`
- `edge.payload_exceeded`
- `edge.context_mismatch`
- `edge.gate_failure`

## No Execution Permit

The edge layer cannot produce `ExecutionPermit`.

It may produce only a `ValidatedEdgeRequest`. Core execution still requires tenant/workspace context validation, authorization, policy, approval and execution gate checks.
