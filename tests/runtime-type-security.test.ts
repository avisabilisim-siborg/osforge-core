import type { RuntimeExecutionContext, RuntimeStatus } from "../packages/runtime/src/index.js";

// Runtime status is a closed union.
// @ts-expect-error "MAYBE" is not a valid runtime status.
const badStatus: RuntimeStatus = "MAYBE";
void badStatus;

// The execution context is immutable — its bindings cannot be reassigned.
declare const context: RuntimeExecutionContext;
// @ts-expect-error tenantId is readonly on the immutable runtime context.
context.tenantId = "tenant_2";
// @ts-expect-error permitId is readonly on the immutable runtime context.
context.permitId = "permit_2";
