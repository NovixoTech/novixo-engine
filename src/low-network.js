/**
 * low-network.js — Novixo Engine (Phase 7b)
 * Low Network Mode.
 *
 * Auto-activates on DEGRADED or UNSTABLE networks.
 * Optimizes every outgoing payload to use as little data as possible.
 *
 * WHAT IT DOES:
 *  1. Strips non-essential fields from payloads
 *  2. Compresses string values (trims whitespace, removes nulls)
 *  3. Defers LOW priority items until network improves
 *  4. Fires callbacks so UI can show "Low network mode" banner
 */

const DEFAULT_OPTIONS = {
  enabled:          true,
  stripFields:      [],      // field names to remove on low network
  compressStrings:  true,    // trim strings, remove null/undefined
  deferLowPriority: true,    // hold LOW items until STABLE
  onLowNetworkOn:   null,    // () => {}
  onLowNetworkOff:  null,    // () => {}
};

let options       = { ...DEFAULT_OPTIONS };
let isActive      = false;
let deferredItems = [];

// ── Init ──────────────────────────────────────

export function initLowNetwork(userOptions = {}) {
  options       = { ...DEFAULT_OPTIONS, ...userOptions };
  isActive      = false;
  deferredItems = [];
}

// ── Activate / deactivate ─────────────────────

export function activateLowNetwork() {
  if (isActive) return;
  isActive = true;
  console.log("[NovixoEngine:LowNetwork] ON — optimizing payloads.");
  if (options.onLowNetworkOn) options.onLowNetworkOn();
}

export function deactivateLowNetwork() {
  if (!isActive) return;
  isActive = false;
  console.log("[NovixoEngine:LowNetwork] OFF — full sync resumed.");
  if (options.onLowNetworkOff) options.onLowNetworkOff();
}

export function isLowNetworkActive() { return isActive; }

// ── Optimize ──────────────────────────────────

export function optimizeItem(item) {
  if (!isActive || !options.enabled) return item;

  let payload = item.payload ?? {};

  if (options.stripFields.length > 0) {
    payload = stripFields(payload, options.stripFields);
  }

  if (options.compressStrings) {
    payload = compressPayload(payload);
  }

  return { ...item, payload, _lowNetworkOptimized: true };
}

export function shouldDefer(item) {
  if (!isActive || !options.deferLowPriority) return false;
  return item.priority === "LOW";
}

// ── Deferred items ────────────────────────────

export function addDeferred(item)    { deferredItems.push(item); }
export function getDeferredItems()   { return [...deferredItems]; }
export function clearDeferred()      { const items = [...deferredItems]; deferredItems = []; return items; }

// ── Stats ─────────────────────────────────────

export function getLowNetworkStats() {
  return { isActive, deferredCount: deferredItems.length, stripFields: options.stripFields };
}

// ── Internal helpers ──────────────────────────

function stripFields(payload, fields) {
  if (!payload || typeof payload !== "object") return payload;
  const result = { ...payload };
  fields.forEach((f) => delete result[f]);
  return result;
}

function compressPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const result = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") { result[key] = value.trim(); continue; }
    if (typeof value === "object" && !Array.isArray(value)) { result[key] = compressPayload(value); continue; }
    result[key] = value;
  }
  return result;
}
