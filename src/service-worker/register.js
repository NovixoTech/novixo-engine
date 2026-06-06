/**
 * register.js — Novixo Engine (Phase 7a)
 * Service Worker Registration Helper.
 * The ONLY file developers touch for SW integration.
 *
 * USAGE:
 *   import { registerNovixoSW } from "novixo-engine/sw";
 *   await registerNovixoSW({ syncEndpoint: "/api/sync" });
 */

let _registration = null;

export async function registerNovixoSW(options = {}) {
  if (!("serviceWorker" in navigator)) {
    console.warn("[NovixoSW] Service workers not supported.");
    return null;
  }

  const {
    swPath   = "/novixo-sw.js",
    onSynced,
    onQueued,
    onError,
  } = options;

  try {
    _registration = await navigator.serviceWorker.register(swPath, { scope: "/" });
    console.log("[NovixoSW] Registered ✓");

    navigator.serviceWorker.addEventListener("message", (event) => {
      const { type, entry, url } = event.data ?? {};
      if (type === "NOVIXO_SW_SYNCED" && onSynced) onSynced(entry);
      if (type === "NOVIXO_SW_QUEUED" && onQueued)  onQueued(url);
    });

    return _registration;
  } catch (err) {
    console.error("[NovixoSW] Registration failed:", err);
    if (onError) onError(err);
    return null;
  }
}

export function syncSW() {
  if (!_registration) return Promise.resolve();
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => { if (e.data.type === "NOVIXO_SYNC_COMPLETE") resolve(); };
    navigator.serviceWorker.controller?.postMessage({ type: "NOVIXO_SYNC_NOW" }, [ch.port2]);
    setTimeout(resolve, 5000); // timeout fallback
  });
}

export function getSWQueue() {
  if (!_registration) return Promise.resolve([]);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = (e) => { if (e.data.type === "NOVIXO_QUEUE_DATA") resolve(e.data.entries ?? []); };
    navigator.serviceWorker.controller?.postMessage({ type: "NOVIXO_GET_QUEUE" }, [ch.port2]);
    setTimeout(() => resolve([]), 1000);
  });
}

export function clearSWQueue() {
  if (!_registration) return Promise.resolve();
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    navigator.serviceWorker.controller?.postMessage({ type: "NOVIXO_CLEAR_QUEUE" }, [ch.port2]);
  });
}

export function isSWActive() {
  return !!("serviceWorker" in navigator && navigator.serviceWorker.controller);
             }
