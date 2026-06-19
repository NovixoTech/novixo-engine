# Novixo Engine

> **Novixo Engine is an adaptive network intelligence layer for apps that can't afford to break when the network does. Most SDKs treat connectivity as binary, online or offline. Real networks degrade, flap, and recover unpredictably, especially on mobile.**
> Novixo Engine detects this in real time and adapts automatically, batching on weak connections, queuing offline, and prioritizing what matters most.
> Build apps that work everywhere — online, offline, slow networks, unstable connections.

[![npm version](https://img.shields.io/npm/v/novixo-engine.svg)](https://www.npmjs.com/package/novixo-engine)
[![license](https://img.shields.io/npm/l/novixo-engine.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue.svg)](./index.d.ts)

---

## Why Novixo Engine?

Most apps assume the network is perfect. It never is.

Requests fail silently. Users lose data. Payments duplicate. Apps freeze on slow connections. In moving vehicles, elevators, rural areas, and anywhere with unstable connectivity — apps break in ways developers never planned for.

**Novixo Engine sits between your app and the network.** It intercepts failures, queues actions intelligently, syncs automatically when conditions improve, and makes your app feel instant — even on the worst connections in the world.

One SDK. Works on web, React Native, and Expo.

---

## Install

```bash
npm install novixo-engine
```

For React Native / Expo:
```bash
expo install @react-native-async-storage/async-storage
```

---

## Quick Start

```js
import Novixo, { Priority, NovixoEvent } from "novixo-engine";

await Novixo.init({
  syncHandler: async (item) => {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    return res.ok;
  },

  onSyncSuccess: (item) => console.log("✅ Synced:", item.id),
  onQueueChange: (size) => console.log("📦 Queue:", size),
});

// Send data — works online AND offline
await Novixo.send({ type: "message", payload: { text: "Hello!" } });

// Send with priority
await Novixo.send({ type: "payment", payload: { amount: 5000 } }, Priority.HIGH);

// Listen to events
Novixo.on(NovixoEvent.SYNCED,  (item) => updateUI(item));
Novixo.on(NovixoEvent.NETWORK, (state) => setNetworkBadge(state));
Novixo.on(NovixoEvent.FAILED,  (item, err) => showError(err));
```

---

## How It Works

```
User action
    ↓
Novixo evaluates network state
    ↓
STABLE    → send immediately
DEGRADED  → batch into groups, reduce payload
UNSTABLE  → HIGH priority only, hold the rest
OFFLINE   → store in IndexedDB / AsyncStorage
    ↓
Network recovers → auto-sync in priority order
    ↓
Conflicts resolved automatically
    ↓
Queue cleared ✓
```

---

## Features

### 4-State Network Intelligence

Novixo understands four real-world network states — not just online/offline.

| State | Meaning | What Novixo does |
|---|---|---|
| `STABLE` | Fast, reliable | Send immediately |
| `DEGRADED` | Slow or inconsistent | Batch + compress payloads |
| `UNSTABLE` | Frequent failures | HIGH priority only |
| `OFFLINE` | No connection | Store locally |

```js
import { NetworkState } from "novixo-engine";

console.log(Novixo.getNetworkState());
// "STABLE" | "DEGRADED" | "UNSTABLE" | "OFFLINE"

// Force a state for testing
Novixo.forceNetworkState(NetworkState.OFFLINE);
```

---

### Priority Queue

Not all data is equal. Payments go before analytics.

```js
import { Priority } from "novixo-engine";

// 🔴 HIGH — payments, auth, critical actions (syncs first, even on unstable networks)
await Novixo.send({ type: "payment", payload: { amount: 5000 } }, Priority.HIGH);

// 🟡 MEDIUM — messages, updates (default)
await Novixo.send({ type: "message", payload: { text: "Hello" } });

// 🟢 LOW — analytics, logs (syncs last, deferred on weak networks)
await Novixo.send({ type: "analytics", payload: { event: "page_view" } }, Priority.LOW);
```

---

### Service Worker (Zero Code Changes)

Register once. Every fetch() call in your app is protected automatically.
No need to change how you write requests.

```bash
# Step 1: copy the SW file to your public folder
cp node_modules/novixo-engine/src/service-worker/novixo-sw.js public/novixo-sw.js
```

```js
// Step 2: register once in your app entry point
import { registerNovixoSW } from "novixo-engine/sw";

await registerNovixoSW({
  onSynced: (entry) => console.log("SW synced:", entry.url),
  onQueued: (url)   => console.log("SW queued:", url),
});
```

That's it. Your existing `fetch()` calls now queue automatically when offline and replay when the network returns — even if the browser tab is closed.

---

### Transaction Integrity — Exactly-Once Delivery

Critical for banks and fintech. Guarantees a payment is never processed twice, even if the network drops at the exact moment of confirmation.

```js
await Novixo.init({
  transactions: true,
  syncHandler: async (item) => {
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "Idempotency-Key": item._idempotencyKey, // attach to your request
      },
      body: JSON.stringify(item),
    });
    return res.ok;
  },
});

// Payment is safe — will never duplicate even on retry
await Novixo.sendTransaction({
  type:    "payment",
  payload: { amount: 5000, to: "user_123" },
});
```

---

### Encrypted Queue — AES-256-GCM

Queue items are encrypted before being written to IndexedDB.
Anyone opening browser dev tools sees only gibberish.

```js
await Novixo.init({
  encryption:    true,
  encryptionKey: process.env.QUEUE_ENCRYPTION_KEY, // min 16 chars, from env
  syncHandler:   async (item) => { ... },
});

console.log(Novixo.isEncryptionReady()); // true
```

Required for banking, healthcare, and government applications.

---

### Optimistic UI

Make your app feel instant. Update the UI immediately, sync in the background.

```js
await Novixo.sendOptimistic(
  { type: "message", payload: { text: "Hello!" } },
  {
    onOptimistic: (tempId, data) => {
      // Runs immediately — show message in UI as "sending"
      addMessageToChat({ ...data, id: tempId, status: "sending" });
    },
    onConfirmed: (tempId, item) => {
      // Server confirmed — update to "delivered"
      updateMessageStatus(tempId, "delivered");
    },
    onReverted: (tempId, error) => {
      // Failed — remove from UI and show error
      removeMessage(tempId);
      showError("Message failed to send");
    },
  }
);
```

---

### Ordered Execution

For delivery apps and multi-step flows. Items declare dependencies — they only sync after their prerequisites succeed.

```js
// Delivery driver goes offline. Steps queued in order.
const acceptId  = await Novixo.send({ type: "accept_order",  payload: { orderId: "o_1" } });
const pickupId  = await Novixo.send({ type: "pickup",        payload: { orderId: "o_1" }, dependsOn: [acceptId] });
const deliverId = await Novixo.send({ type: "deliver",       payload: { orderId: "o_1" }, dependsOn: [pickupId] });

// When online: accept syncs first, then pickup, then deliver. Always.
```

---

### Endpoint Failover

If your primary server goes down, Novixo tries backup endpoints automatically.

```js
await Novixo.init({
  endpoints: [
    "https://api-primary.yourapp.com/sync",
    "https://api-backup.yourapp.com/sync",
    "https://api-fallback.yourapp.com/sync",
  ],
  syncHandler: async (item) => {
    const res = await Novixo.fetchWithFailover(item);
    return res.ok;
  },
});

// Primary fails → backup tried → fallback tried → all health-checked automatically
console.log(Novixo.getFailoverStats());
```

---

### Response Cache

Reduce API calls and data usage. Serve cached responses instantly.

```js
// Fetch + cache automatically
const profile = await Novixo.cacheFetch("/api/user/profile", {
  ttl: 5 * 60 * 1000, // cache for 5 minutes
});

// Manual cache
await Novixo.cacheSet("config", appConfig, 60 * 60 * 1000); // 1 hour
const config = Novixo.cacheGet("config");

// Stats
console.log(Novixo.getCacheStats());
// { activeEntries: 12, keys: [...], expiredEntries: 3 }
```

---

### Event System

Subscribe to any engine event with a familiar on/off pattern.

```js
import { NovixoEvent } from "novixo-engine";

Novixo.on(NovixoEvent.SYNCED,          (item)        => console.log("Synced:", item.id));
Novixo.on(NovixoEvent.FAILED,          (item, err)   => console.warn("Failed:", err.message));
Novixo.on(NovixoEvent.QUEUED,          (item)        => updateBadge());
Novixo.on(NovixoEvent.NETWORK,         (state)       => setStatusBar(state));
Novixo.on(NovixoEvent.SAFE_MODE_ON,    (stats)       => showWarningBanner(stats));
Novixo.on(NovixoEvent.LOW_NETWORK_ON,  ()            => showDataSaverBanner());
Novixo.on(NovixoEvent.CONFLICT,        (item, server)=> logConflict(item));
Novixo.on(NovixoEvent.DUPLICATE,       (item, origId)=> console.log("Dropped duplicate"));

// One-time listener
Novixo.once(NovixoEvent.SYNCED, (item) => showSuccessToast());

// Remove listener
Novixo.off(NovixoEvent.SYNCED, handler);
```

---

### Conflict Resolution

When the same data is edited offline on two devices, Novixo resolves it automatically.

```js
import { ConflictStrategy } from "novixo-engine";

await Novixo.init({
  conflictStrategy: ConflictStrategy.CLIENT_WINS,
  // Options: LAST_WRITE_WINS (default) | CLIENT_WINS | SERVER_WINS | MANUAL

  syncHandler: async (item) => {
    const res = await fetch("/api/sync", { ... });

    // Signal a conflict when server returns 409
    if (res.status === 409) {
      return { conflict: true, serverItem: await res.json() };
    }

    return res.ok;
  },

  onConflictResolved: (resolvedItem, strategy) => {
    console.log(`Conflict resolved via ${strategy}`);
  },
});
```

---

### Queue Cancel / Edit

User changes their mind before the network returns? No problem.

```js
const id = await Novixo.send({ type: "message", payload: { text: "Hello" } });

// Cancel before it syncs
await Novixo.cancelItem(id);

// Or update the payload
await Novixo.updateItem(id, { payload: { text: "Hello, updated!" } });

// Check if still queued
console.log(Novixo.hasItem(id)); // false (if cancelled)
```

---

### Safe Mode

When failures spike, Novixo automatically protects your server.

```js
await Novixo.init({
  safeMode: true,
  safeModeOptions: {
    enterThreshold:  0.6, // 60% failures → safe mode on
    exitThreshold:   0.3, // 30% failures → safe mode off
    retryMultiplier: 3,   // retry delays 3x slower in safe mode
  },
  onSafeMode:     (stats) => showBanner("Experiencing issues — sending critical data only"),
  onSafeModeExit: ()      => hideBanner(),
  syncHandler: async (item) => { ... },
});

console.log(Novixo.isInSafeMode());      // true | false
console.log(Novixo.getSafeModeStats());  // { state, failureRate, totalSynced, ... }
```

---

### Sync Timeline

Full activity log for every event in the engine. Debugging made easy.

```js
await Novixo.init({
  timeline: true,
  timelineOptions: {
    onEntry: (entry) => {
      console.log(`[${entry.time}] ${entry.event} — ${entry.message}`);
    },
  },
  syncHandler: async (item) => { ... },
});

// Read anytime
Novixo.getTimeline();         // all entries, newest first
Novixo.getTimelineIssues();   // errors + warnings only
Novixo.getTimelineSummary();  // { synced: 12, failed: 1, queued: 3 }
Novixo.exportTimeline();      // JSON string for bug reports
```

---

### Low Network Mode

Automatically reduces data usage on weak connections.
Useful for mobile-first apps and markets with expensive data.

```js
await Novixo.init({
  lowNetwork: true,
  lowNetworkOptions: {
    stripFields:      ["metadata", "analytics"], // remove these fields on weak networks
    compressStrings:  true,   // trim whitespace, remove nulls
    deferLowPriority: true,   // hold LOW items until STABLE
  },
  onLowNetworkOn:  () => showDataSaverBanner(),
  onLowNetworkOff: () => hideDataSaverBanner(),
  syncHandler: async (item) => { ... },
});

console.log(Novixo.isLowNetworkActive());  // true | false
console.log(Novixo.getLowNetworkStats());  // { isActive, deferredCount }
```

---

### Deduplication

User taps "Send" 3 times because nothing appeared to happen.
Without deduplication: 3 requests hit your server.
With deduplication: only 1 goes through.

```js
import { DedupeStrategy } from "novixo-engine";

await Novixo.init({
  dedupe: true,
  dedupeOptions: {
    strategy: DedupeStrategy.STRICT, // strict | type | custom
    windowMs: 5000,                  // 5 second window
  },
  onDuplicate: (item, originalId) => {
    console.log("Duplicate dropped — original:", originalId);
  },
  syncHandler: async (item) => { ... },
});
```

---

### Mobile — React Native / Expo

```js
await Novixo.init({
  platform: "mobile", // switches storage from IndexedDB → AsyncStorage
  syncHandler: async (item) => { ... },
});
```

---

### Batch Sync

On degraded networks, Novixo automatically groups items to reduce API calls.

```js
await Novixo.init({
  batchSyncHandler: async (items) => {
    const res = await fetch("/api/sync/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
    const { results } = await res.json();
    return results; // [true, false, true, ...] matching items order
  },
  syncHandler: async (item) => { ... }, // single-item fallback
});
```

---

## Full API Reference

### Core

| Method | Description |
|---|---|
| `await Novixo.init(config)` | Initialize the engine |
| `await Novixo.send(data, priority?)` | Queue item — sends immediately if online |
| `await Novixo.sendTransaction(data)` | Send with exactly-once guarantee |
| `await Novixo.sendOptimistic(data, opts)` | Send with instant UI update |
| `await Novixo.syncNow()` | Manually trigger sync |
| `Novixo.destroy()` | Teardown engine |

### Network

| Method | Description |
|---|---|
| `Novixo.isOnline()` | True if not OFFLINE |
| `Novixo.getNetworkState()` | Current 4-state status |
| `Novixo.forceNetworkState(state)` | Override state (for testing) |
| `Novixo.isLowNetworkActive()` | True if low network mode is on |
| `Novixo.getLowNetworkStats()` | `{ isActive, deferredCount }` |

### Queue

| Method | Description |
|---|---|
| `Novixo.getQueue()` | All queued items |
| `Novixo.queueSize()` | Number of items in queue |
| `await Novixo.clearQueue()` | Clear all items |
| `await Novixo.cancelItem(id)` | Remove item before sync |
| `await Novixo.updateItem(id, data)` | Update item payload before sync |
| `Novixo.hasItem(id)` | Check if item is still queued |
| `Novixo.getItem(id)` | Get item by ID |

### Cache

| Method | Description |
|---|---|
| `await Novixo.cacheFetch(url, opts)` | Fetch + cache automatically |
| `await Novixo.cacheSet(key, value, ttl)` | Store in cache |
| `Novixo.cacheGet(key)` | Read from cache |
| `Novixo.cacheHas(key)` | Check if key exists and is valid |
| `await Novixo.cacheDelete(key)` | Remove one entry |
| `await Novixo.cacheClear()` | Clear all cache |
| `Novixo.getCacheStats()` | Active entries, keys, expiry |

### Events

| Method | Description |
|---|---|
| `Novixo.on(event, handler)` | Subscribe to engine event |
| `Novixo.once(event, handler)` | One-time subscription |
| `Novixo.off(event, handler)` | Remove listener |
| `Novixo.offAll(event?)` | Remove all listeners |
| `Novixo.getRegisteredEvents()` | All active event names |
| `Novixo.listenerCount(event)` | Count listeners for event |

### Failover

| Method | Description |
|---|---|
| `await Novixo.fetchWithFailover(item)` | Fetch across fallback endpoints |
| `Novixo.getCurrentEndpoint()` | Active endpoint URL |
| `Novixo.getFailoverStats()` | `{ currentEndpoint, endpoints }` |

### Timeline

| Method | Description |
|---|---|
| `Novixo.getTimeline()` | All entries, newest first |
| `Novixo.getItemTimeline(id)` | History for one item |
| `Novixo.getTimelineIssues()` | Errors and warnings only |
| `Novixo.getTimelineSummary()` | `{ synced, failed, queued, retries }` |
| `Novixo.exportTimeline()` | JSON string for bug reports |
| `Novixo.clearTimeline()` | Reset the log |
| `Novixo.onTimelineEntry(cb)` | Live callback on every entry |

### Safe Mode

| Method | Description |
|---|---|
| `Novixo.isInSafeMode()` | True if safe mode is active |
| `Novixo.getSafeModeStats()` | `{ state, failureRate, totalSynced, ... }` |

### Flap Guard

| Method | Description |
|---|---|
| `Novixo.getFlapStats()` | `{ flapCount, isStabilizing, history }` |

### Deduplication

| Method | Description |
|---|---|
| `Novixo.getFingerprintCount()` | Active fingerprints |
| `Novixo.clearFingerprints()` | Reset deduplication state |

### Service Worker

```js
import { registerNovixoSW, syncSW, getSWQueue, clearSWQueue, isSWActive } from "novixo-engine/sw";
```

| Method | Description |
|---|---|
| `await registerNovixoSW(opts)` | Register the service worker |
| `await syncSW()` | Trigger SW sync manually |
| `await getSWQueue()` | Get SW queue contents |
| `await clearSWQueue()` | Clear SW queue |
| `isSWActive()` | True if SW is controlling the page |

---

## Configuration Reference

```js
await Novixo.init({
  // ── Required ──────────────────────────────────────────
  syncHandler: async (item) => boolean | { conflict, serverItem },

  // ── Core ──────────────────────────────────────────────
  platform:        "web" | "mobile" | null,  // auto-detected
  autoSync:        true,
  defaultPriority: Priority.MEDIUM,

  // ── Retry ─────────────────────────────────────────────
  retryLimit: 5,
  retryDelay: { STABLE: 2000, DEGRADED: 5000, UNSTABLE: 10000, OFFLINE: 0 },
  backoff:    true,
  backoffOptions: { baseDelay: 1000, maxDelay: 30000, multiplier: 2, jitter: true },

  // ── Timeout ───────────────────────────────────────────
  timeout:   true,
  timeoutMs: 10000,
  onTimeout: (item) => {},

  // ── Batch sync ────────────────────────────────────────
  batchSyncHandler: async (items) => boolean[],
  batchConfig: { degradedBatchSize: 5, unstableBatchSize: 3 },

  // ── Network quality ───────────────────────────────────
  qualityConfig: { stableMs: 300, degradedMs: 1500, pingInterval: 10000 },

  // ── Conflict resolution ───────────────────────────────
  conflictStrategy:   ConflictStrategy.LAST_WRITE_WINS,
  onConflict:         async (clientItem, serverItem) => resolvedItem,
  onConflictResolved: (resolvedItem, strategy) => {},

  // ── Deduplication ─────────────────────────────────────
  dedupe: true,
  dedupeOptions: { strategy: DedupeStrategy.STRICT, windowMs: 5000 },
  onDuplicate: (item, originalId) => {},

  // ── Flap guard ────────────────────────────────────────
  flapGuard: true,
  flapGuardOptions: { stabilityMs: 3000, maxFlaps: 10 },
  onFlap:   (count, history) => {},
  onStable: () => {},

  // ── Safe mode ─────────────────────────────────────────
  safeMode: true,
  safeModeOptions: { window: 10, enterThreshold: 0.6, exitThreshold: 0.3, retryMultiplier: 3 },
  onSafeMode:     (stats) => {},
  onSafeModeExit: (stats) => {},

  // ── Timeline ──────────────────────────────────────────
  timeline: true,
  timelineOptions: { maxEntries: 200, onEntry: (entry) => {} },

  // ── Low network ───────────────────────────────────────
  lowNetwork: true,
  lowNetworkOptions: { stripFields: [], compressStrings: true, deferLowPriority: true },
  onLowNetworkOn:  () => {},
  onLowNetworkOff: () => {},

  // ── Transactions ──────────────────────────────────────
  transactions: false,  // opt-in

  // ── Encryption ────────────────────────────────────────
  encryption:    false,  // opt-in
  encryptionKey: null,   // required if encryption: true

  // ── Ordered execution ─────────────────────────────────
  orderedExecution: true,

  // ── Cache ─────────────────────────────────────────────
  cache: true,

  // ── Failover ──────────────────────────────────────────
  endpoints:       [],   // fallback endpoint URLs
  failoverOptions: { retryPerEndpoint: 1, timeoutMs: 8000, healthCheckMs: 30000 },

  // ── Callbacks ─────────────────────────────────────────
  onSyncSuccess:        (item) => {},
  onSyncFailure:        (item, error) => {},
  onQueueChange:        (size) => {},
  onNetworkStateChange: (newState, oldState) => {},
});
```

---

## Named Exports

```js
import Novixo, {
  Priority,           // HIGH | MEDIUM | LOW
  NetworkState,       // STABLE | DEGRADED | UNSTABLE | OFFLINE
  ConflictStrategy,   // LAST_WRITE_WINS | CLIENT_WINS | SERVER_WINS | MANUAL
  DedupeStrategy,     // STRICT | TYPE | CUSTOM
  SafeModeState,      // NORMAL | SAFE_MODE
  TxnState,           // PENDING | SENT | CONFIRMED | FAILED
  TimelineEvent,      // ITEM_QUEUED | ITEM_SYNCED | ITEM_FAILED | ...
  LogLevel,           // INFO | SUCCESS | WARN | ERROR
  NovixoEvent,        // synced | failed | queued | network | ...
} from "novixo-engine";
```

---

## CDN

No install needed for quick prototyping:

```html
<script type="module">
  import Novixo from "https://unpkg.com/novixo-engine@3.0.0/index.js";
  await Novixo.init({ ... });
</script>
```

---

## Who Is This For?

| Industry | Key features used |
|---|---|
| 💬 Chat apps | Optimistic UI, deduplication, ordered execution |
| 🏦 Fintech / Banking | Transaction integrity, encryption, safe mode |
| 🚚 Delivery apps | Ordered execution, flap guard, low network mode |
| 🤖 AI-powered apps | Response cache, failover, timeout handling |
| 🏥 Healthcare | Encryption, transaction integrity, audit timeline |
| 🎓 EdTech | Offline queue, low network mode, cache |
| 🛒 E-commerce | Optimistic UI, deduplication, conflict resolution |
| 🌍 Any app with real-world users | All of the above |

---

## Roadmap

- [x] Phase 1   — Offline queue engine
- [x] Phase 2   — React Native / Expo adapter
- [x] Phase 3   — Conflict resolution
- [x] Phase 4a  — 4-state network + priority + batching
- [x] Phase 4b  — npm package
- [x] Phase 5a  — Sync timeline
- [x] Phase 5b  — Deduplication
- [x] Phase 5c  — Network flap protection
- [x] Phase 5d  — Safe mode
- [x] Phase 6a  — TypeScript definitions
- [x] Phase 6b  — Exponential backoff
- [x] Phase 6c  — Request timeout
- [x] Phase 6d  — Queue cancel / edit
- [x] Phase 6e  — Optimistic UI
- [x] Phase 7a  — Service worker
- [x] Phase 7b  — Low network mode
- [x] Phase 7c  — Transaction integrity
- [x] Phase 7d  — Encrypted queue
- [x] Phase 7e  — Ordered execution
- [x] Phase 7f  — Response cache
- [x] Phase 7g  — Event emitter
- [x] Phase 7h  — Endpoint failover

---

## License

MIT © [NovixoTech](https://github.com/NovixoTech)
