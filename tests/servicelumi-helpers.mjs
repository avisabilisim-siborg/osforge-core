// Shared fixtures for the ServiceLumi Foundation tests.
import {
  tenantId,
  organizationId,
  workspaceId,
  actorId
} from "../dist/tenant-boundary/src/index.js";

export const NOW = "2026-07-18T12:00:00.000Z";

export function scope(tenant, org = "org-1", ws = "ws-1") {
  return {
    tenantId: tenantId(tenant),
    organizationId: organizationId(org),
    workspaceId: workspaceId(ws)
  };
}

export const SHOP_A = scope("tenant-shop-a");
export const SHOP_B = scope("tenant-shop-b");

export function caller(s, tenantState = "ACTIVE") {
  return { scope: s, tenantState };
}

export const OPERATOR = actorId("actor-operator-1");
export const TECHNICIAN = actorId("actor-technician-1");
