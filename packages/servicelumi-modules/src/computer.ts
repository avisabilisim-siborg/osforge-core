/**
 * ServiceLumi computer technical service module. Declarative vertical
 * definition for desktop/laptop repair. Pure data — no execution authority.
 */

import type { ServiceModuleDefinition } from "../../servicelumi-core/src/index.js";

export const COMPUTER_SERVICE_MODULE: ServiceModuleDefinition = Object.freeze({
  key: "computer_service",
  displayName: "Computer Technical Service",
  deviceNoun: "computer",
  deviceAttributes: Object.freeze([
    Object.freeze({ name: "formFactor", kind: "enum", required: true, enumValues: Object.freeze(["DESKTOP", "LAPTOP", "ALL_IN_ONE", "SERVER"]) } as const),
    Object.freeze({ name: "cpu", kind: "string", required: false } as const),
    Object.freeze({ name: "gpu", kind: "string", required: false } as const),
    Object.freeze({ name: "ramGb", kind: "number", required: false } as const),
    Object.freeze({ name: "storageDescription", kind: "string", required: false } as const),
    Object.freeze({ name: "operatingSystem", kind: "string", required: false } as const),
    Object.freeze({ name: "batteryHealthPct", kind: "number", required: false } as const),
    Object.freeze({ name: "hasCustomerDataOnDisk", kind: "boolean", required: true } as const),
    Object.freeze({ name: "dataBackupConsent", kind: "boolean", required: true } as const),
    Object.freeze({ name: "dataAccessConsent", kind: "boolean", required: true } as const)
  ]),
  faultTaxonomy: Object.freeze([
    Object.freeze({ code: "PC_NO_POWER", label: "No power / does not start" }),
    Object.freeze({ code: "PC_NO_BOOT", label: "Powers on but does not boot" }),
    Object.freeze({ code: "PC_OVERHEAT", label: "Overheating / thermal shutdown" }),
    Object.freeze({ code: "PC_DISK_FAULT", label: "Disk fault / data recovery needed" }),
    Object.freeze({ code: "PC_RAM_FAULT", label: "Memory fault" }),
    Object.freeze({ code: "PC_GPU_FAULT", label: "Display / graphics fault" }),
    Object.freeze({ code: "PC_KEYBOARD", label: "Keyboard / input device fault" }),
    Object.freeze({ code: "PC_SCREEN", label: "Laptop screen fault" }),
    Object.freeze({ code: "PC_SOFTWARE", label: "Operating system / software fault" }),
    Object.freeze({ code: "PC_VIRUS", label: "Malware cleanup" })
  ]),
  intakeChecklist: Object.freeze([
    "Record whether the customer has a backup of their data",
    "Record explicit data backup and data access consent (never note passwords or PINs)",
    "Record accessories received (charger, bag, cables)",
    "Record visible case damage before accepting the device",
    "Confirm whether data recovery is in scope"
  ]),
  qualityChecklist: Object.freeze([
    "Disk health test completed",
    "Temperature/stress test completed",
    "Boot and OS check completed"
  ])
});
