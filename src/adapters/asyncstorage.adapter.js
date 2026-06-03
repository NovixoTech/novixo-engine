/**
 * adapters/asyncstorage.adapter.js — Novixo Sync
 * ─────────────────────────────────────────────────
 * Storage adapter for MOBILE (React Native / Expo).
 * Uses AsyncStorage — Expo's persistent key-value store.
 *
 * INSTALL REQUIREMENT:
 *   expo install @react-native-async-storage/async-storage
 *
 * SAME PUBLIC API as indexeddb.adapter.js — drop-in swap.
 * queue.js, core.js, network.js need ZERO changes.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "novixo_";

/**
 * Save a value to AsyncStorage
 * AsyncStorage only stores strings — we JSON.stringify objects.
 * @param {string} key
 * @param {any} value
 * @returns {Promise<boolean>}
 */
export async function saveLocal(key, value) {
  try {
    const serialized = JSON.stringify(value);
    await AsyncStorage.setItem(key, serialized);
    return true;
  } catch (e) {
    console.warn(`[NovixoSync:AsyncStorage] Failed to save "${key}":`, e);
    return false;
  }
}

/**
 * Load a value from AsyncStorage
 * @param {string} key
 * @param {any} fallback
 * @returns {Promise<any>}
 */
export async function loadLocal(key, fallback = null) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[NovixoSync:AsyncStorage] Failed to load "${key}":`, e);
    return fallback;
  }
}

/**
 * Remove a key from AsyncStorage
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function removeLocal(key) {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch (e) {
    console.warn(`[NovixoSync:AsyncStorage] Failed to remove "${key}":`, e);
    return false;
  }
}

/**
 * Clear all Novixo-related keys (prefixed with "novixo_")
 * @returns {Promise<boolean>}
 */
export async function clearAllNovixoData() {
  try {
    // Get ALL keys in AsyncStorage
    const allKeys = await AsyncStorage.getAllKeys();

    // Filter only Novixo keys
    const novixoKeys = allKeys.filter((key) => key.startsWith(PREFIX));

    if (novixoKeys.length === 0) {
      console.log("[NovixoSync:AsyncStorage] No Novixo keys to clear.");
      return true;
    }

    // Delete all at once (multiRemove is faster than one-by-one)
    await AsyncStorage.multiRemove(novixoKeys);
    console.log(`[NovixoSync:AsyncStorage] Cleared ${novixoKeys.length} Novixo key(s).`);
    return true;
  } catch (e) {
    console.warn("[NovixoSync:AsyncStorage] Failed to clear data:", e);
    return false;
  }
}

/**
 * Check if AsyncStorage is available
 * @returns {Promise<boolean>}
 */
export async function isStorageAvailable() {
  try {
    const testKey = "__novixo_test__";
    await AsyncStorage.setItem(testKey, "1");
    await AsyncStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * No-op for mobile — AsyncStorage has no connection to close.
 * Kept for API compatibility with indexeddb.adapter.js.
 */
export function closeDB() {
  // Nothing to close on mobile
}
