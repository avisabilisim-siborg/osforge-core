/**
 * ServiceLumi application composition root for the local vertical slice.
 * Wires the governed core, the DEVELOPMENT session shell, the voice command
 * service and the development OCR service together, and seeds clearly-labeled
 * demo data. Everything here is a development adapter (testOnly) in front of
 * the same typed contracts a production deployment will use.
 */

import { ServiceLumiCore } from "../../servicelumi-core/src/index.js";
import type { CoreCaller } from "../../servicelumi-core/src/index.js";
import { customerId, deviceId, technicianId, workOrderId } from "../../servicelumi-core/src/index.js";
import { ALL_SERVICE_MODULES } from "../../servicelumi-modules/src/index.js";
import { DEFAULT_FLAGS } from "./flags.js";
import type { ServiceLumiFlags } from "./flags.js";
import { DEMO_TENANTS, SessionRegistry } from "./session.js";
import { DevLabelOcrProvider, OcrIntakeService } from "./ocr.js";
import { VoiceCommandService } from "./voice.js";

export const DEMO_ADAPTER_METADATA = Object.freeze({
  id: "servicelumi-demo-inmemory-adapter",
  testOnly: true,
  productionReady: false
});

/**
 * Fail-closed boot guard (P2.3). The demo composition root is built entirely
 * from test-only adapters (in-memory store, demo session shell, dev OCR). It
 * MUST NOT be started in a production-like environment. Enforcing this at the
 * composition root — not just as declarative `productionReady: false` metadata
 * — is what stops the demo adapter from silently running in production.
 *
 * The boot is refused when the environment reports production, unless an
 * explicit, auditable override is present (for red-team / staging drills).
 */
export type BootGuardStatus = "BOOT_ALLOWED" | "BOOT_REFUSED";

export interface BootGuardResult {
  readonly status: BootGuardStatus;
  readonly reason: string;
}

export function evaluateDemoBoot(env: {
  readonly nodeEnv?: string;
  readonly allowDemoOverride?: string;
}): BootGuardResult {
  const isProductionLike = (env.nodeEnv ?? "").trim().toLowerCase() === "production";
  const overridden = env.allowDemoOverride === "i-understand-this-is-a-demo";
  if (isProductionLike && !overridden) {
    return {
      status: "BOOT_REFUSED",
      reason:
        `The ServiceLumi demo is built from test-only adapters (${DEMO_ADAPTER_METADATA.id}, ` +
        "productionReady=false) and refuses to boot with NODE_ENV=production. " +
        "Wire the production identity, persistence and provider adapters instead, " +
        "or set SERVICELUMI_ALLOW_DEMO=i-understand-this-is-a-demo for a controlled drill."
    };
  }
  return { status: "BOOT_ALLOWED", reason: "The environment is not production; the demo may boot." };
}

/** Throws when {@link evaluateDemoBoot} refuses the boot. Called by the web entry point. */
export function assertDemoBootAllowed(env: { readonly nodeEnv?: string; readonly allowDemoOverride?: string }): void {
  const result = evaluateDemoBoot(env);
  if (result.status === "BOOT_REFUSED") {
    throw new Error(result.reason);
  }
}

export class ServiceLumiApp {
  readonly core = new ServiceLumiCore();
  readonly sessions = new SessionRegistry();
  readonly voice: VoiceCommandService;
  readonly ocr: OcrIntakeService;
  readonly flags: ServiceLumiFlags;

  constructor(flags: ServiceLumiFlags = DEFAULT_FLAGS) {
    this.flags = flags;
    this.voice = new VoiceCommandService(this.core);
    this.ocr = new OcrIntakeService(this.core, new DevLabelOcrProvider());
  }

  /** Seeds demo tenants with modules, staff, customers, devices and one order. */
  seedDemoData(now: string): void {
    for (const def of ALL_SERVICE_MODULES) {
      this.core.registerModule(def, now);
    }
    const merkez: CoreCaller = { scope: DEMO_TENANTS[0].scope, tenantState: "ACTIVE" };
    const sanayi: CoreCaller = { scope: DEMO_TENANTS[1].scope, tenantState: "ACTIVE" };

    for (const key of ["tv_service", "computer_service", "phone_service", "appliance_service"] as const) {
      this.core.enableModule(merkez, key, now);
    }
    this.core.enableModule(sanayi, "tv_service", now);
    this.core.enableModule(sanayi, "phone_service", now);

    this.core.createTechnician(merkez, {
      id: technicianId("tech-cert"),
      scope: merkez.scope,
      displayName: "Sertifikalı Teknisyen",
      certifications: ["ELECTRIC_SAFE", "WATER_SAFE", "GAS_SAFE"],
      createdAt: now
    }, now);
    this.core.createTechnician(merkez, {
      id: technicianId("tech-junior"),
      scope: merkez.scope,
      displayName: "Stajyer Teknisyen",
      certifications: [],
      createdAt: now
    }, now);

    this.core.createCustomer(merkez, {
      id: customerId("cust-demo-1"),
      scope: merkez.scope,
      fullName: "Demo Müşteri — Ayşe Yılmaz",
      phone: "+90 555 000 00 01",
      createdAt: now
    }, now);
    this.core.registerDevice(merkez, {
      id: deviceId("dev-demo-tv"),
      scope: merkez.scope,
      customerId: customerId("cust-demo-1"),
      moduleKey: "tv_service",
      brand: "Vestel",
      model: "55U9500",
      serialNumber: "SN123456789",
      attributes: { tvKind: "LED_TV", screenSizeInches: 55, panelType: "LED", smartTv: true },
      createdAt: now
    }, now);
    this.core.openWorkOrder(merkez, {
      id: workOrderId("wo-demo-1"),
      customerId: customerId("cust-demo-1"),
      deviceId: deviceId("dev-demo-tv"),
      reportedProblem: "Ses var, görüntü yok (demo kaydı)"
    }, now);
  }
}
