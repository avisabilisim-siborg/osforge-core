/**
 * ServiceLumi TV technical service module. Declarative vertical definition for
 * television repair: panel/backlight/board-level fault taxonomy and an intake
 * checklist matching real bench workflow. Pure data — no execution authority.
 */

import type { ServiceModuleDefinition } from "../../servicelumi-core/src/index.js";

export const TV_SERVICE_MODULE: ServiceModuleDefinition = Object.freeze({
  key: "tv_service",
  displayName: "TV Technical Service",
  deviceNoun: "television",
  deviceAttributes: Object.freeze([
    Object.freeze({ name: "tvKind", kind: "enum", required: true, enumValues: Object.freeze(["LED_TV", "OLED_TV", "QLED_TV", "MONITOR", "PROJECTION"]) } as const),
    Object.freeze({ name: "screenSizeInches", kind: "number", required: true } as const),
    Object.freeze({ name: "panelType", kind: "enum", required: true, enumValues: Object.freeze(["LED", "OLED", "QLED", "LCD", "PLASMA"]) } as const),
    Object.freeze({ name: "smartTv", kind: "boolean", required: false } as const),
    Object.freeze({ name: "chassisNo", kind: "string", required: false } as const),
    Object.freeze({ name: "panelCode", kind: "string", required: false } as const),
    Object.freeze({ name: "mainBoardCode", kind: "string", required: false } as const),
    Object.freeze({ name: "powerBoardCode", kind: "string", required: false } as const),
    Object.freeze({ name: "tconCode", kind: "string", required: false } as const),
    Object.freeze({ name: "ledBarCode", kind: "string", required: false } as const)
  ]),
  faultTaxonomy: Object.freeze([
    Object.freeze({ code: "TV_NO_POWER", label: "No power / does not turn on" }),
    Object.freeze({ code: "TV_NO_BACKLIGHT", label: "Sound present, no backlight" }),
    Object.freeze({ code: "TV_PANEL_DAMAGE", label: "Panel broken or lines on panel" }),
    Object.freeze({ code: "TV_POWER_BOARD", label: "Power board fault" }),
    Object.freeze({ code: "TV_MAIN_BOARD", label: "Main board fault" }),
    Object.freeze({ code: "TV_TCON_BOARD", label: "T-CON board fault" }),
    Object.freeze({ code: "TV_NO_SIGNAL", label: "No signal / tuner fault" }),
    Object.freeze({ code: "TV_SOFTWARE", label: "Firmware / software fault" }),
    Object.freeze({ code: "TV_AUDIO", label: "Audio fault" })
  ]),
  intakeChecklist: Object.freeze([
    "Record visible panel damage before accepting the device",
    "Record whether the remote control and stand are included",
    "Photograph the serial label if present (before photo)",
    "Confirm the reported problem with the customer"
  ]),
  qualityChecklist: Object.freeze([
    "Panel inspection completed",
    "Backlight test completed",
    "Picture and sound test completed",
    "After photo captured"
  ])
});
