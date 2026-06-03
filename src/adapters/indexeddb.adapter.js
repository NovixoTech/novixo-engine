/**
 * adapters/indexeddb.adapter.js — Novixo Sync
 * ─────────────────────────────────────────────
 * Storage adapter for WEB (browsers).
 * Uses IndexedDB — 50MB+, async, stores any JS object.
 *
 * This is Phase 1.4's storage.js extracted into the adapter pattern.
 * Import this in storage.js when running in a browser environment.
 */

const DB_NAME = "novixo_db";
const DB_VERSION = 1;
const STORE_NAME = "novixo_store";

let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);

    if (typeof indexedDB === "undefined") {
      return reject(new Error("IndexedDB is not available in this environment."));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getStore(mode = "readonly") {
  const database = await openDB();
  const tx = database.transaction(STORE_NAME, mode);
  return tx.objectStore(STORE_NAME);
}

export async function saveLocal(key, value) {
  try {
    const store = await getStore("readwrite");
    return new Promise((resolve, reject) => {
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn(`[NovixoSync:IndexedDB] Failed to save "${key}":`, e);
    return false;
  }
}

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
    console.warn(`[NovixoSync:IndexedDB] Failed to load "${key}":`, e);
    return fallback;
  }
}

export async function removeLocal(key) {
  try {
    const store = await getStore("readwrite");
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn(`[NovixoSync:IndexedDB] Failed to remove "${key}":`, e);
    return false;
  }
}

export async function clearAllNovixoData() {
  try {
    const store = await getStore("readwrite");
    return new Promise((resolve, reject) => {
      const keysToDelete = [];
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.key.startsWith("novixo_")) keysToDelete.push(cursor.key);
          cursor.continue();
        } else {
          if (keysToDelete.length === 0) return resolve(true);
          let count = 0;
          keysToDelete.forEach((key) => {
            store.delete(key).onsuccess = () => {
              if (++count === keysToDelete.length) resolve(true);
            };
          });
        }
      };

      cursorRequest.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    console.warn("[NovixoSync:IndexedDB] Failed to clear data:", e);
    return false;
  }
}

export async function isStorageAvailable() {
  try {
    await openDB();
    return true;
  } catch (e) {
    return false;
  }
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
