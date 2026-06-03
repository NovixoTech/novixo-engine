/**
 * storage.js — Novixo Sync
 * Local persistence layer. Wraps localStorage with safe fallbacks.
 * Future: swap this for IndexedDB or AsyncStorage (React Native).
 */

/**
 * Save a value to local storage
 * @param {string} key
 * @param {any} value — will be JSON serialized
 */
export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`[NovixoSync:Storage] Failed to save key "${key}":`, e);
    return false;
  }
}

/**
 * Load a value from local storage
 * @param {string} key
 * @param {any} fallback — returned if key not found or parse fails
 */
export function loadLocal(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[NovixoSync:Storage] Failed to load key "${key}":`, e);
    return fallback;
  }
}

/**
 * Remove a key from local storage
 * @param {string} key
 */
export function removeLocal(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn(`[NovixoSync:Storage] Failed to remove key "${key}":`, e);
    return false;
  }
}

/**
 * Clear all Novixo-related keys from storage
 * (keys prefixed with "novixo_")
 */
export function clearAllNovixoData() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("novixo_")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    console.log(`[NovixoSync:Storage] Cleared ${keysToRemove.length} Novixo key(s).`);
    return true;
  } catch (e) {
    console.warn("[NovixoSync:Storage] Failed to clear Novixo data:", e);
    return false;
  }
}

/**
 * Check if local storage is available in this environment
 */
export function isStorageAvailable() {
  try {
    const testKey = "__novixo_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}
