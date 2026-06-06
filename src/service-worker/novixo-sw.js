/**
 * novixo-sw.js — Novixo Engine (Phase 7a)
 * ──────────────────────────────────────────────
 * Novixo Service Worker.
 * Copy this file to your PUBLIC folder (e.g. /public/novixo-sw.js).
 *
 * Intercepts every fetch() call automatically.
 * Zero code changes needed in existing apps.
 *
 * HOW IT WORKS:
 *   Online + stable  → request passes through normally
 *   Offline/unstable → stored in IndexedDB, returns 202 Accepted
 *   Tab closed       → background sync fires when network returns
 *   Network returns  → all queued requests replay automatically
 */

const SW_VERSION  = "novixo-sw-v2";
const QUEUE_DB    = "novixo_sw_queue";
const QUEUE_STORE = "requests";
const SYNC_TAG    = "novixo-background-sync";

// ── Lifecycle ─────────────────────────────────

self.addEventListener("install",  (e) => {
  console.log(`[NovixoSW] ${SW_VERSION} installing...`);
  e.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (e) => {
  console.log(`[NovixoSW] ${SW_VERSION} activated.`);
  e.waitUntil(self.clients.claim());
});

// ── Fetch interception ────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!shouldIntercept(request)) return;
  event.respondWith(handleRequest(request));
});

function shouldIntercept(request) {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return false;
  const url = new URL(request.url);
  // Never intercept the sync endpoint itself
  if (url.pathname.includes("/novixo-sync")) return false;
  if (url.pathname.includes("novixo-sw")) return false;
  return true;
}

async function handleRequest(request) {
  if (navigator.onLine) {
    try {
      const response = await fetch(request.clone());
      if (response.ok || response.status < 500) return response;
      // Server error — queue for retry
      await queueRequest(request);
      return syntheticAccepted(request.url);
    } catch {
      // Network failure — queue it
      await queueRequest(request);
      return syntheticAccepted(request.url);
    }
  }
  // Offline — queue immediately
  await queueRequest(request);
  return syntheticAccepted(request.url);
}

function syntheticAccepted(url) {
  return new Response(
    JSON.stringify({
      queued:  true,
      message: "Request queued by Novixo Engine — will sync when online",
      url,
    }),
    {
      status:  202,
      headers: {
        "Content-Type":    "application/json",
        "X-Novixo-Queued": "true",
      },
    }
  );
}

// ── Queue a request ───────────────────────────

async function queueRequest(request) {
  const db   = await openSWDB();
  const body = await safeReadBody(request);

  const entry = {
    id:        `sw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    url:       request.url,
    method:    request.method,
    headers:   Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now(),
    retries:   0,
  };

  const tx = db.transaction(QUEUE_STORE, "readwrite");
  tx.objectStore(QUEUE_STORE).add(entry);

  console.log(`[NovixoSW] Queued → ${request.method} ${request.url}`);

  // Register background sync if supported
  if ("sync" in self.registration) {
    try { await self.registration.sync.register(SYNC_TAG); } catch {}
  }
}

// ── Background sync ───────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    console.log("[NovixoSW] Background sync triggered.");
    event.waitUntil(syncQueued());
  }
});

async function syncQueued() {
  const db      = await openSWDB();
  const entries = await getAllQueued(db);
  if (!entries.length) return;

  console.log(`[NovixoSW] Syncing ${entries.length} queued request(s)...`);

  for (const entry of entries) {
    try {
      const res = await fetch(entry.url, {
        method:  entry.method,
        headers: { ...entry.headers, "Content-Type": "application/json" },
        body:    entry.body ? JSON.stringify(entry.body) : undefined,
      });

      if (res.ok) {
        await removeQueued(db, entry.id);
        notifyClients({ type: "NOVIXO_SW_SYNCED", entry });
        console.log(`[NovixoSW] ✓ Synced: ${entry.method} ${entry.url}`);
      } else {
        await incrementRetry(db, entry);
      }
    } catch (err) {
      await incrementRetry(db, entry);
    }
  }
}

// ── App ↔ SW message bridge ───────────────────

self.addEventListener("message", async (event) => {
  const { type } = event.data ?? {};

  if (type === "NOVIXO_SYNC_NOW") {
    await syncQueued();
    event.ports[0]?.postMessage({ type: "NOVIXO_SYNC_COMPLETE" });
  }

  if (type === "NOVIXO_GET_QUEUE") {
    const db      = await openSWDB();
    const entries = await getAllQueued(db);
    event.ports[0]?.postMessage({ type: "NOVIXO_QUEUE_DATA", entries });
  }

  if (type === "NOVIXO_CLEAR_QUEUE") {
    const db = await openSWDB();
    await clearAllQueued(db);
    event.ports[0]?.postMessage({ type: "NOVIXO_QUEUE_CLEARED" });
  }
});

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((c) => c.postMessage(message));
}

// ── IndexedDB helpers ─────────────────────────

function openSWDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function getAllQueued(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, "readonly")
      .objectStore(QUEUE_STORE).getAll();
    req.onsuccess = (e) => resolve(e.target.result ?? []);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function removeQueued(db, id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, "readwrite")
      .objectStore(QUEUE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function incrementRetry(db, entry) {
  if (entry.retries >= 5) {
    await removeQueued(db, entry.id);
    console.warn(`[NovixoSW] Item [${entry.id}] retry limit hit — removed.`);
    return;
  }
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, "readwrite")
      .objectStore(QUEUE_STORE)
      .put({ ...entry, retries: entry.retries + 1 });
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

function clearAllQueued(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(QUEUE_STORE, "readwrite")
      .objectStore(QUEUE_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function safeReadBody(request) {
  try {
    const text = await request.clone().text();
    return text ? JSON.parse(text) : null;
  } catch { return null; }
}
