import test from "node:test";
import assert from "node:assert/strict";

import { ServiceLumiApp, DEMO_TENANTS } from "../dist/servicelumi-app/src/index.js";
import { startServiceLumiWeb } from "../dist/servicelumi-web/src/server.js";

const NOW = "2026-07-18T12:00:00.000Z";

async function running() {
  const app = new ServiceLumiApp();
  app.seedDemoData(NOW);
  const web = await startServiceLumiWeb(app, 0);
  const base = `http://127.0.0.1:${web.port}`;
  return { app, web, base };
}

async function login(base, user = "user-owner", tenant = "tenant-merkez") {
  const response = await fetch(`${base}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user, tenant, locale: "tr", theme: "dark" }).toString(),
    redirect: "manual"
  });
  const cookie = response.headers.get("set-cookie") ?? "";
  return cookie.split(";")[0];
}

test("web: login issues a session and the dashboard renders seeded tenant data", async () => {
  const { web, base } = await running();
  try {
    const anonymous = await fetch(`${base}/dashboard`, { redirect: "manual" });
    assert.equal(anonymous.status, 303);
    const sid = await login(base);
    assert.ok(sid.startsWith("sid="));
    const dashboard = await fetch(`${base}/dashboard`, { headers: { Cookie: sid } });
    const html = await dashboard.text();
    assert.equal(dashboard.status, 200);
    assert.ok(html.includes("DEMO"));
    assert.ok(html.includes("wo-demo-1"));
  } finally {
    await web.close();
  }
});

test("web: the customer form creates a record through the governed core", async () => {
  const { app, web, base } = await running();
  try {
    const sid = await login(base);
    const post = await fetch(`${base}/customers/new`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: sid },
      body: new URLSearchParams({ fullName: "Web Test Musterisi", phone: "+90 555 111 22 33" }).toString(),
      redirect: "manual"
    });
    assert.equal(post.status, 303);
    const caller = { scope: DEMO_TENANTS[0].scope, tenantState: "ACTIVE" };
    const names = app.core.listCustomers(caller, NOW).map((c) => c.fullName);
    assert.ok(names.includes("Web Test Musterisi"));
  } finally {
    await web.close();
  }
});

test("web: tenant data does not leak across sessions of different tenants", async () => {
  const { web, base } = await running();
  try {
    const sanayi = await login(base, "user-owner", "tenant-sanayi");
    const orders = await fetch(`${base}/orders`, { headers: { Cookie: sanayi } });
    const html = await orders.text();
    assert.equal(orders.status, 200);
    assert.ok(!html.includes("wo-demo-1"));
    const detail = await fetch(`${base}/orders/wo-demo-1`, { headers: { Cookie: sanayi } });
    assert.equal(detail.status, 404);
  } finally {
    await web.close();
  }
});

test("web: a cross-tenant offline sync envelope is rejected whole", async () => {
  const { web, base } = await running();
  try {
    const sid = await login(base);
    const foreign = DEMO_TENANTS[1].scope;
    const own = DEMO_TENANTS[0].scope;
    const envelope = {
      operations: [
        { idempotencyKey: "k1", tenantId: own.tenantId, organizationId: own.organizationId, workspaceId: own.workspaceId, kind: "work_order_transition", workOrderId: "wo-demo-1", to: "DIAGNOSING" },
        { idempotencyKey: "k2", tenantId: foreign.tenantId, organizationId: foreign.organizationId, workspaceId: foreign.workspaceId, kind: "work_order_transition", workOrderId: "wo-demo-1", to: "CANCELLED" }
      ]
    };
    const response = await fetch(`${base}/mobile/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: sid },
      body: new URLSearchParams({ envelope: JSON.stringify(envelope) }).toString()
    });
    const body = await response.json();
    assert.equal(body.decision.decision, "ENVELOPE_REJECTED");
    assert.equal(body.decision.reasonCode, "envelope_scope_violation");
    assert.deepEqual(body.applied, []);
  } finally {
    await web.close();
  }
});

test("web: a same-tenant offline envelope applies and a replay is deduplicated", async () => {
  const { app, web, base } = await running();
  try {
    const sid = await login(base);
    const own = DEMO_TENANTS[0].scope;
    const envelope = {
      operations: [
        { idempotencyKey: "sync-1", tenantId: own.tenantId, organizationId: own.organizationId, workspaceId: own.workspaceId, kind: "work_order_transition", workOrderId: "wo-demo-1", to: "DIAGNOSING" }
      ]
    };
    const send = () => fetch(`${base}/mobile/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: sid },
      body: new URLSearchParams({ envelope: JSON.stringify(envelope) }).toString()
    }).then((r) => r.json());
    const first = await send();
    assert.equal(first.decision.decision, "ENVELOPE_ACCEPTED");
    assert.equal(first.applied.length, 1);
    assert.ok(first.applied[0].includes("WRITE_ACCEPTED"));
    const replay = await send();
    assert.equal(replay.decision.decision, "ENVELOPE_ACCEPTED");
    assert.deepEqual(replay.duplicates, ["sync-1"]);
    assert.deepEqual(replay.applied, []);
    const caller = { scope: own, tenantState: "ACTIVE" };
    const order = app.core.listWorkOrders(caller, NOW).find((o) => o.id === "wo-demo-1");
    assert.equal(order.state, "DIAGNOSING");
  } finally {
    await web.close();
  }
});

test("web: IMEI attributes are masked on the devices screen", async () => {
  const { app, web, base } = await running();
  try {
    const caller = { scope: DEMO_TENANTS[0].scope, tenantState: "ACTIVE" };
    const { customerId, deviceId } = await import("../dist/servicelumi-core/src/index.js");
    app.core.registerDevice(caller, {
      id: deviceId("dev-phone-imei"),
      scope: DEMO_TENANTS[0].scope,
      customerId: customerId("cust-demo-1"),
      moduleKey: "phone_service",
      brand: "Samsung",
      model: "S24",
      attributes: { deviceKind: "PHONE", imei: "356938035643809", liquidContact: "NONE", screenLockShared: false },
      createdAt: NOW
    }, NOW);
    const sid = await login(base);
    const devices = await fetch(`${base}/devices`, { headers: { Cookie: sid } });
    const html = await devices.text();
    assert.ok(!html.includes("356938035643809"));
    assert.ok(html.includes("3809"));
  } finally {
    await web.close();
  }
});
