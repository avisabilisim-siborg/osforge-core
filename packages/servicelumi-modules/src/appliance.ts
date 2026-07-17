/**
 * ServiceLumi white-goods (major appliance) technical service module.
 * Declarative vertical definition for washer/refrigerator/dishwasher/oven
 * repair, including on-site visits. Pure data — no execution authority.
 */

import type { ServiceModuleDefinition } from "../../servicelumi-core/src/index.js";

export const APPLIANCE_SERVICE_MODULE: ServiceModuleDefinition = Object.freeze({
  key: "appliance_service",
  displayName: "White Goods Technical Service",
  deviceNoun: "appliance",
  deviceAttributes: Object.freeze([
    Object.freeze({ name: "applianceKind", kind: "enum", required: true, enumValues: Object.freeze(["WASHING_MACHINE", "REFRIGERATOR", "DISHWASHER", "OVEN", "DRYER", "AIR_CONDITIONER"]) } as const),
    Object.freeze({ name: "onSiteService", kind: "boolean", required: true } as const),
    Object.freeze({ name: "productionYear", kind: "number", required: false } as const)
  ]),
  faultTaxonomy: Object.freeze([
    Object.freeze({ code: "AP_NO_POWER", label: "No power / does not start" }),
    Object.freeze({ code: "AP_NOT_HEATING", label: "Does not heat" }),
    Object.freeze({ code: "AP_NOT_COOLING", label: "Does not cool" }),
    Object.freeze({ code: "AP_WATER_LEAK", label: "Water leak" }),
    Object.freeze({ code: "AP_DRUM_MOTOR", label: "Drum / motor fault" }),
    Object.freeze({ code: "AP_PUMP", label: "Pump fault" }),
    Object.freeze({ code: "AP_CONTROL_BOARD", label: "Control board fault" }),
    Object.freeze({ code: "AP_NOISE", label: "Abnormal noise / vibration" }),
    Object.freeze({ code: "AP_DOOR_SEAL", label: "Door / seal fault" })
  ]),
  intakeChecklist: Object.freeze([
    "Record whether the visit is on-site or the appliance is brought to the shop",
    "Record model and serial label information",
    "Record visible transport damage before accepting the appliance",
    "Confirm water/electric installation conditions for on-site visits"
  ])
});
