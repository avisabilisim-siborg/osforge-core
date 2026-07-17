/**
 * ServiceLumi mobile phone technical service module. Declarative vertical
 * definition for phone/tablet repair. Pure data — no execution authority.
 */

import type { ServiceModuleDefinition } from "../../servicelumi-core/src/index.js";

export const PHONE_SERVICE_MODULE: ServiceModuleDefinition = Object.freeze({
  key: "phone_service",
  displayName: "Mobile Phone Technical Service",
  deviceNoun: "phone",
  deviceAttributes: Object.freeze([
    Object.freeze({ name: "deviceKind", kind: "enum", required: true, enumValues: Object.freeze(["PHONE", "TABLET", "SMARTWATCH"]) } as const),
    Object.freeze({ name: "imei", kind: "string", required: false } as const),
    Object.freeze({ name: "imei2", kind: "string", required: false } as const),
    Object.freeze({ name: "color", kind: "string", required: false } as const),
    Object.freeze({ name: "storageGb", kind: "number", required: false } as const),
    Object.freeze({ name: "batteryHealthPct", kind: "number", required: false } as const),
    Object.freeze({ name: "liquidContact", kind: "enum", required: true, enumValues: Object.freeze(["NONE", "SUSPECTED", "CONFIRMED"]) } as const),
    Object.freeze({ name: "partQualityClass", kind: "enum", required: false, enumValues: Object.freeze(["ORIGINAL", "OEM", "A_PLUS", "REFURBISHED"]) } as const),
    Object.freeze({ name: "screenLockShared", kind: "boolean", required: true } as const)
  ]),
  faultTaxonomy: Object.freeze([
    Object.freeze({ code: "PH_SCREEN_BROKEN", label: "Broken screen / touch fault" }),
    Object.freeze({ code: "PH_BATTERY", label: "Battery drains or swollen" }),
    Object.freeze({ code: "PH_CHARGING_PORT", label: "Charging port fault" }),
    Object.freeze({ code: "PH_NO_POWER", label: "No power / does not turn on" }),
    Object.freeze({ code: "PH_LIQUID_DAMAGE", label: "Liquid damage" }),
    Object.freeze({ code: "PH_CAMERA", label: "Camera fault" }),
    Object.freeze({ code: "PH_SPEAKER_MIC", label: "Speaker / microphone fault" }),
    Object.freeze({ code: "PH_SOFTWARE", label: "Software / OS fault" }),
    Object.freeze({ code: "PH_NETWORK", label: "SIM / network fault" })
  ]),
  intakeChecklist: Object.freeze([
    "Record visible frame and screen damage before accepting the device",
    "Record whether the customer shared the screen lock (never store the code itself in notes)",
    "Record IMEI from the device or box when available",
    "Advise the customer that liquid-damage repairs carry no warranty"
  ]),
  qualityChecklist: Object.freeze([
    "Screen and touch test completed",
    "Camera test completed",
    "Case/frame inspection completed",
    "Call and network test completed"
  ])
});
