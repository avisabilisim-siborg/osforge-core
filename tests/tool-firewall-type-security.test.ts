import type {
  TenantId,
  WorkspaceId,
  ToolId,
  ConnectorId,
  ToolPermitRef,
  SyscallClass,
  ToolInvocationStatus,
  RegisteredTool
} from "../packages/tool-firewall/src/index.js";
import { toolId, tenantId } from "../packages/tool-firewall/src/index.js";

// Branded ids are not interchangeable.
const tid: TenantId = tenantId("t1");
// @ts-expect-error a TenantId is not a WorkspaceId.
const w: WorkspaceId = tid;
void w;

const tl: ToolId = toolId("tool1");
// @ts-expect-error a ToolId is not a ConnectorId.
const c: ConnectorId = tl;
void c;

declare const cid: ConnectorId;
// @ts-expect-error a ConnectorId is not a ToolPermitRef.
const pr: ToolPermitRef = cid;
void pr;

// A raw string is not a branded ToolId.
// @ts-expect-error a plain string is not a ToolId.
const bad: ToolId = "tool1";
void bad;

// SyscallClass is a closed union.
const good: SyscallClass = "NETWORK";
void good;
// @ts-expect-error "GPU" is not a known syscall class.
const badClass: SyscallClass = "GPU";
void badClass;

// A RegisteredTool is deeply readonly.
declare const tool: RegisteredTool;
// @ts-expect-error revoked is readonly.
tool.revoked = true;

// ToolInvocationStatus is a string-literal union carrier, not a boolean.
declare const status: ToolInvocationStatus;
// @ts-expect-error a status is not a boolean.
const asBool: boolean = status;
void asBool;
