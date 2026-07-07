# ADR 0011: Edge Security Boundary

## Status

Accepted

## Context

OSForge Core must not allow untrusted traffic to reach kernel, policy, approval, workflow, tool execution or agent runtime directly.

Edge controls such as WAF, request normalization, payload limits, rate limits and abuse detection must be represented before core execution.

## Decision

Create a dedicated `packages/edge-security` boundary.

The edge layer uses branded request types. Raw requests cannot be treated as validated requests, and validated edge requests cannot be treated as execution permits.

Rate limiting and abuse detection are vendor-neutral adapter contracts.

All ambiguous, malformed, oversized, rate-limited, suspicious, adapter-failed or context-mismatched requests fail closed.

## Consequences

- Edge security remains separate from kernel and policy internals.
- Vendors can be swapped without changing core contracts.
- Critical endpoint classes can enforce stricter thresholds without weakening default-deny handling for standard endpoints.
- The edge layer cannot produce `ExecutionPermit`; execution authorization remains inside the existing secure execution chain.
