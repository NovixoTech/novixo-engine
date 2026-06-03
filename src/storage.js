/**
 * storage.js — Novixo Sync (Phase 1.4)
 * ─────────────────────────────────────
 * Upgraded from localStorage → IndexedDB.
 *
 * WHY IndexedDB?
 *  • localStorage: ~5MB limit, synchronous, strings only
 *  • IndexedDB:    ~50MB+ limit, async, stores any JS object
 *
 * SAME PUBLIC API as before — queue.js needs zero logic changes,
 * only needs to await these calls.
 *
 * ADAPTER PATTERN:
 *  This file is the storage adapter. For Phase 2 (React Native),
 *  swap this file for an SQLite adapter — everything else stays the same.
 */

const DB_NAME = "novixo_db";
const DB_VERSION = 1;
const STORE_NAME = "novixo_store";

let db = null; // Cached DB connection

// ─────────────────────────────────────────────
// INTERNAL: Open (or reuse) the IndexedDB connection
// ─────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    // Return cached connection if already open
    if (db) return resolve(db);

    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not available in this environment."));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs on first open OR version upgrade
    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
        console.log("[NovixoSync:Storage] IndexedDB store created.");
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("[NovixoSync:Storage] IndexedDB opened successfully.");
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("[NovixoSync:Storage] Failed to open IndexedDB:", event.target.error);
      reject(event.target.error);
    };
  });
}

// ─────────────────────────────────────────────
// INTERNAL: Get a transaction + object store
// ─────────────────────────────────────────────
async function getStore(mode = "readonly") {
  const database = await openDB();
  const tx = database.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

// ─────────────────────────────────────────────
// PUBLIC API
// (Same function names as the old localStorage version)
// ─────────────────────────────────────────────

/**
 * Save a value to IndexedDB
 * @param {string} key
 * @param {any} value — stored as a JS object, no JSON.stringify needed
 * @returns {Promise<boolean>}
 */
export async function saveLocal(key, value) {
  try {
    const store = await getStore("readwrite");

    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn(`[NovixoSync:Storage] Failed to save key "${key}":`, e);
    return false;
  }
}

/**
 * Load a value from IndexedDB
 * @param {string} key
 * @param {any} fallback — returned if key not found
 * @returns {Promise<any>}
 */
export async function loadLocal(key, fallback = null) {
  try {
    const store = await getStore("readonly");

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = (e) => {
        const result = e.target.result;
        resolve(result ? result.value : fallback);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn(`[NovixoSync:Storage] Failed to load key "${key}":`, e);
    return fallback;
  }
}

/**
 * Remove a key from IndexedDB
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function removeLocal(key) {
  try {
    const store = await getStore("readwrite");

    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn(`[NovixoSync:Storage] Failed to remove key "${key}":`, e);
    return false;
  }
}

/**
 * Clear all Novixo-related keys (keys prefixed with "novixo_")
 * @returns {Promise<boolean>}
 */
export async function clearAllNovixoData() {
  try {
    const store = await getStore("readwrite");

    return new Promise((resolve, reject) => {
      const keysToDelete = [];
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.key.startsWith("novixo_")) {
            keysToDelete.push(cursor.key);
          }
          cursor.continue();
        } else {
          // All keys scanned — now delete matching ones
          let deleteCount = 0;
          keysToDelete.forEach((key) => {
            const del = store.delete(key);
            del.onsuccess = () => {
              deleteCount++;
              if (deleteCount === keysToDelete.length) {
                console.log(
                  `[NovixoSync:Storage] Cleared ${keysToDelete.length} Novixo key(s).`
                );
                resolve(true);
              }
            };
          });

          // If nothing to delete, resolve immediately
          if (keysToDelete.length === 0) resolve(true);
        }
      };

      cursorRequest.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn("[NovixoSync:Storage] Failed to clear Novixo data:", e);
    return false;
  }
}

/**
 * Check if IndexedDB is available in this environment
 * @returns {Promise<boolean>}
 */
export async function isStorageAvailable() {
  try {
    await openDB();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Close the DB connection (useful for testing / cleanup)
 */
export function closeDB() {
  if (db) {
    db.close();
    db = null;
    console.log("[NovixoSync:Storage] IndexedDB connection closed.");
  }
  }
