/**
 * sw.js — Novixo Engine Service Worker Entry Point (Phase 7a)
 * ──────────────────────────────────────────────────────────
 * Import this in your app to register the Novixo service worker.
 *
 * STEP 1: Copy novixo-sw.js to your public folder
 *   cp node_modules/novixo-engine/src/service-worker/novixo-sw.js public/novixo-sw.js
 *
 * STEP 2: Register in your app entry point
 *   import { registerNovixoSW } from "novixo-engine/sw";
 *   await registerNovixoSW({ syncEndpoint: "/api/sync" });
 */

export {
  registerNovixoSW,
  syncSW,
  getSWQueue,
  clearSWQueue,
  isSWActive,
} from "./src/service-worker/register.js";
