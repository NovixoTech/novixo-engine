/**
 * storage.js — Novixo Sync (Phase 2)
 * ─────────────────────────────────────
 * Smart storage router.
 * Automatically picks the right adapter based on environment:
 *
 *   Browser  → IndexedDB adapter  (Phase 1.4)
 *   Mobile   → AsyncStorage adapter (Phase 2)
 *
 * HOW TO USE:
 *   - Web project:    no change needed — IndexedDB is auto-selected
 *   - Mobile project: set NOVIXO_PLATFORM = "mobile" before calling init()
 *
 * queue.js, core.js, network.js stay 100% unchanged.
 * Only THIS file knows about adapters.
 */

// ─────────────────────────────────────────────
// Detect environment
// ─────────────────────────────────────────────

/**
 * Returns true if running inside React Native / Expo
 */
function isReactNative() {
  return (
    typeof navigator !== "undefined" &&
    navigator.product === "ReactNative"
  );
}

// ─────────────────────────────────────────────
// Load the correct adapter
// ─────────────────────────────────────────────

let adapter = null;

/**
 * Initialize the storage adapter.
 * Call this once — core.js calls it automatically during init().
 *
 * @param {"web"|"mobile"} platform — override auto-detection if needed
 */
export async function initStorage(platform) {
  const env = platform || (isReactNative() ? "mobile" : "web");

  if (env === "mobile") {
    // React Native / Expo
    const mod = await import("./adapters/asyncstorage.adapter.js");
    adapter = mod;
    console.log("[NovixoSync:Storage] Adapter: AsyncStorage (mobile) ✓");
  } else {
    // Browser
    const mod = await import("./adapters/indexeddb.adapter.js");
    adapter = mod;
    console.log("[NovixoSync:Storage] Adapter: IndexedDB (web) ✓");
  }
}

// ─────────────────────────────────────────────
// PUBLIC API — delegates to active adapter
// queue.js calls these — it never touches adapters directly
// ─────────────────────────────────────────────

function requireAdapter(fnName) {
  if (!adapter) {
    throw new Error(
      `[NovixoSync:Storage] Storage not initialized. Call Novixo.init() before ${fnName}().`
    );
  }
}

/**
 * Save a value
 * @param {string} key
 * @param {any} value
 * @returns {Promise<boolean>}
 */
export async function saveLocal(key, value) {
  requireAdapter("saveLocal");
  return adapter.saveLocal(key, value);
}

/**
 * Load a value
 * @param {string} key
 * @param {any} fallback
 * @returns {Promise<any>}
 */
export async function loadLocal(key, fallback = null) {
  requireAdapter("loadLocal");
  return adapter.loadLocal(key, fallback);
}

/**
 * Remove a key
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function removeLocal(key) {
  requireAdapter("removeLocal");
  return adapter.removeLocal(key);
}

/**
 * Clear all Novixo data
 * @returns {Promise<boolean>}
 */
export async function clearAllNovixoData() {
  requireAdapter("clearAllNovixoData");
  return adapter.clearAllNovixoData();
}

/**
 * Check if storage is available
 * @returns {Promise<boolean>}
 */
export async function isStorageAvailable() {
  if (!adapter) return false;
  return adapter.isStorageAvailable();
}

/**
 * Close storage connection (web only — no-op on mobile)
 */
export function closeDB() {
  if (adapter && adapter.closeDB) {
    adapter.closeDB();
  }
}
