/**
 * ServiceLumi local development entry point.
 * Run after `npm run build`:  node dist/servicelumi-web/src/main.js
 * Serves the DEMO vertical slice (in-memory adapter, seeded data) on
 * http://127.0.0.1:3311 — development only, never production (S4.1).
 */

/// <reference path="./internal/node-http.d.ts" />
import { ServiceLumiApp } from "../../servicelumi-app/src/index.js";
import { startServiceLumiWeb } from "./server.js";

const PORT = Number(process.env["SERVICELUMI_PORT"] ?? "3311");

const app = new ServiceLumiApp();
app.seedDemoData(new Date().toISOString());

startServiceLumiWeb(app, PORT)
  .then((running) => {
    console.log(`ServiceLumi DEMO web listening on http://127.0.0.1:${running.port}`);
  })
  .catch((error: unknown) => {
    console.error("ServiceLumi web failed to start:", error);
    process.exitCode = 1;
  });
