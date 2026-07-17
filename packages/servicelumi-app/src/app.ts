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
