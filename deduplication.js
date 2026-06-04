/**
 * deduplication.js — Novixo Engine (Phase 5b)
 * ──────────────────────────────────────────────
 * Deduplication Engine.
 *
 * THE PROBLEM:
 * User taps "Send" 3 times because nothing appeared to happen.
 * Without deduplication → 3 identical requests hit your server.
 * With deduplication  → only 1 goes through. Others are silently dropped.
 *
 * Real examples:
 *  - Payment tapped twice → charged twice ❌
 *  - Message sent 3 times → 3 copies in chat ❌
 *  - Form submitted twice → duplicate DB record ❌
 *
 * HOW IT WORKS:
 * Every item gets a "fingerprint" — a hash of its type + payload.
 * Before queuing, we check if a matching fingerprint already exists
 * and is still within the time window. If yes → drop the duplicate.
 *
 * THREE STRATEGIES:
 *  "strict"  — type + full payload must match (default)
 *  "type"    — same type is enough to deduplicate
 *  "custom"  — you provide the key function: (item) => string
 *
 * WINDOW:
 * Fingerprints expire after windowMs (default 5s).
 * After expiry, the same action is allowed through again.
 */

export const DedupeStrategy = {
  STRICT: "strict",
  TYPE:   "type",
  CUSTOM: "custom",
};

const DEFAULT_OPTIONS = {
  enabled:  true,
  strategy: "strict",
  windowMs: 5000,
  keyFn:    null,
};

let options = { ...DEFAULT_OPTIONS };
let fingerprints = new Map(); // fingerprint → { itemId, timestamp }

// ── Init ──────────────────────────────────────

export function initDedupe(userOptions = {}) {
  options = { ...DEFAULT_OPTIONS, ...userOptions };
  fingerprints = new Map();
}

// ── Check + register ──────────────────────────

/**
 * Check if item is a duplicate. If not, register its fingerprint.
 * @param {Object} item
 * @returns {{ isDuplicate: boolean, originalId: string|null, fingerprint: string|null }}
 */
export function checkAndRegister(item) {
  if (!options.enabled) {
    return { isDuplicate: false, originalId: null, fingerprint: null };
  }

  pruneExpired();

  const fingerprint = generateFingerprint(item);

  if (fingerprints.has(fingerprint)) {
    const existing = fingerprints.get(fingerprint);
    console.log(
      `[NovixoEngine:Dedupe] Duplicate dropped — matches [${existing.itemId}]`
    );
    return { isDuplicate: true, originalId: existing.itemId, fingerprint };
  }

  fingerprints.set(fingerprint, { itemId: item.id, timestamp: Date.now() });
  return { isDuplicate: false, originalId: null, fingerprint };
}

// ── Release ───────────────────────────────────

/** Remove fingerprint when item syncs — allows same action later */
export function releaseFingerprint(itemId) {
  for (const [fp, data] of fingerprints.entries()) {
    if (data.itemId === itemId) {
      fingerprints.delete(fp);
      return;
    }
  }
}

export function clearFingerprints() {
  fingerprints.clear();
}

export function getFingerprintCount() {
  return fingerprints.size;
}

// ── Fingerprint generation ────────────────────

function generateFingerprint(item) {
  switch (options.strategy) {
    case "type":
      return `type:${item.type ?? "unknown"}`;

    case "custom":
      if (typeof options.keyFn !== "function") {
        console.warn("[NovixoEngine:Dedupe] CUSTOM needs keyFn. Falling back to STRICT.");
        return strictFingerprint(item);
      }
      return `custom:${options.keyFn(item)}`;

    case "strict":
    default:
      return strictFingerprint(item);
  }
}

function strictFingerprint(item) {
  const type    = item.type ?? "unknown";
  const payload = item.payload ?? item.data ?? {};
  return `strict:${type}:${simpleHash(stableStringify(payload))}`;
}

// ── Helpers ───────────────────────────────────

function pruneExpired() {
  const now = Date.now();
  for (const [fp, data] of fingerprints.entries()) {
    if (now - data.timestamp > options.windowMs) {
      fingerprints.delete(fp);
    }
  }
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => `"${k}":${stableStringify(obj[k])}`).join(",") + "}";
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
  }
