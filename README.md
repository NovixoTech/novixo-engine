# Novixo Engine

Novixo Engine is an adaptive network intelligence layer for apps that can't afford to break when the network does. Most SDKs treat connectivity as binary, online or offline. Real networks degrade, flap, and recover unpredictably, especially on mobile. Novixo Engine detects this in real time and adapts automatically, batching on weak connections, queuing offline, and prioritizing what matters most. Build apps that work everywhere — online, offline, slow networks, unstable connections.

![npm version](https://img.shields.io/npm/v/novixo-engine) ![license](https://img.shields.io/npm/l/novixo-engine) ![TypeScript](https://img.shields.io/badge/TypeScript-supported-blue)

## Why Novixo Engine?

Most apps assume the network is perfect. It never is.

Requests fail silently. Users lose data. Payments duplicate. Apps freeze on slow connections. In moving vehicles, elevators, rural areas, and anywhere with unstable connectivity — apps break in ways developers never planned for.

Novixo Engine sits between your app and the network. It intercepts failures, queues actions intelligently, syncs automatically when conditions improve, and makes your app feel instant — even on the worst connections in the world.

One SDK. Works on web, React Native, and Expo.

## Install

```bash
npm install novixo-engine
```

For React Native / Expo:

```bash
expo install @react-native-async-storage/async-storage
```

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

## Features

### 4-State Network Intelligence

Novixo understands four real-world network states — not just online/offline.

| State | Meaning | What Novixo does |
| --- | --- | --- |
| STABLE | Fast, reliable | Send immediately |
| DEGRADED | Slow or inconsistent | Batch + compress payloads |
| UNSTABLE | Frequent failures | HIGH priority only |
| OFFLINE | No connection | Store locally |

```js
import { NetworkState } from "novixo-engine";

console.log(Novixo.getNetworkState());
// "STABLE" | "DEGRADED" | "UNSTABLE" | "OFFLINE"

// Force a state for testing
Novixo.forceNetworkState(NetworkState.OFFLINE);
```

### Priority Queue

Not all data is equal. Payments go before analytics.

```js
import { Priority } from "novixo-engine";

// 🔴 HIGH — payments, auth, critical actions
await Novixo.send({ type: "payment", payload: { amount: 5000 } }, Priority.HIGH);

// 🟡 MEDIUM — messages, updates (default)
await Novixo.send({ type: "message", payload: { text: "Hello" } });

// 🟢 LOW — analytics, logs (syncs last, deferred on weak networks)
await Novixo.send({ type: "analytics", payload: { event: "page_view" } }, Priority.LOW);
```

### Phase 8 — AI Request Manager

Multi-provider AI request handling with automatic failover, rate-limit detection, response caching, and offline queueing.

```js
import { AIRequestManager } from "novixo-engine";
import { createGroqProvider, createGeminiProvider, createAnthropicProvider } from "novixo-engine/ai-providers";

const ai = new AIRequestManager();

ai.registerProvider(createGroqProvider(process.env.GROQ_API_KEY, 1));
ai.registerProvider(createGeminiProvider(process.env.GEMINI_API_KEY, 2));
ai.registerProvider(createAnthropicProvider(process.env.ANTHROPIC_API_KEY, 3));

// If Groq rate-limits, automatically falls over to Gemini, then Anthropic
const result = await ai.request({ prompt: "Explain offline-first in one sentence." });
console.log(result.text);

// Listen to what's happening
ai.on("onRateLimit",       ({ provider }) => console.log(`Rate limited: ${provider}`));
ai.on("onProviderFailover",({ from, to }) => console.log(`Failover: ${from} → ${to}`));
```

Works with any AI provider. Add OpenAI, Mistral, Cohere, or any HTTP-based AI API by writing a simple `send` adapter.

### Service Worker (Zero Code Changes)

Register once. Every fetch() call in your app is protected automatically.

```bash
cp node_modules/novixo-engine/src/service-worker/novixo-sw.js public/novixo-sw.js
```

```js
import { registerNovixoSW } from "novixo-engine/sw";

await registerNovixoSW({
  onSynced: (entry) => console.log("SW synced:", entry.url),
  onQueued: (url)   => console.log("SW queued:", url),
});
```

### Transaction Integrity — Exactly-Once Delivery

```js
await Novixo.init({
  transactions: true,
  syncHandler: async (item) => {
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: {
        "Content-Type":    "application/json",
        "Idempotency-Key": item._idempotencyKey,
      },
      body: JSON.stringify(item),
    });
    return res.ok;
  },
});

await Novixo.sendTransaction({
  type:    "payment",
  payload: { amount: 5000, to: "user_123" },
});
```

### Encrypted Queue — AES-256-GCM

```js
await Novixo.init({
  encryption:    true,
  encryptionKey: process.env.QUEUE_ENCRYPTION_KEY,
  syncHandler:   async (item) => { ... },
});
```

### Optimistic UI

```js
await Novixo.sendOptimistic(
  { type: "message", payload: { text: "Hello!" } },
  {
    onOptimistic: (tempId, data) => addMessageToChat({ ...data, id: tempId, status: "sending" }),
    onConfirmed:  (tempId, item) => updateMessageStatus(tempId, "delivered"),
    onReverted:   (tempId, err)  => { removeMessage(tempId); showError("Message failed"); },
  }
);
```

### Ordered Execution

```js
const acceptId  = await Novixo.send({ type: "accept_order", payload: { orderId: "o_1" } });
const pickupId  = await Novixo.send({ type: "pickup",       payload: { orderId: "o_1" }, dependsOn: [acceptId] });
const deliverId = await Novixo.send({ type: "deliver",      payload: { orderId: "o_1" }, dependsOn: [pickupId] });
```

### Endpoint Failover

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
```

### Response Cache

```js
const profile = await Novixo.cacheFetch("/api/user/profile", { ttl: 5 * 60 * 1000 });

await Novixo.cacheSet("config", appConfig, 60 * 60 * 1000);
const config = Novixo.cacheGet("config");
```

### Event System

```js
import { NovixoEvent } from "novixo-engine";

Novixo.on(NovixoEvent.SYNCED,         (item)         => console.log("Synced:", item.id));
Novixo.on(NovixoEvent.FAILED,         (item, err)    => console.warn("Failed:", err.message));
Novixo.on(NovixoEvent.NETWORK,        (state)        => setStatusBar(state));
Novixo.on(NovixoEvent.LOW_NETWORK_ON, ()             => showDataSaverBanner());
Novixo.on(NovixoEvent.CONFLICT,       (item, server) => logConflict(item));
```

### Conflict Resolution

```js
import { ConflictStrategy } from "novixo-engine";

await Novixo.init({
  conflictStrategy: ConflictStrategy.CLIENT_WINS,
  syncHandler: async (item) => {
    const res = await fetch("/api/sync", { ... });
    if (res.status === 409) {
      return { conflict: true, serverItem: await res.json() };
    }
    return res.ok;
  },
});
```

### Safe Mode

```js
await Novixo.init({
  safeMode: true,
  safeModeOptions: { enterThreshold: 0.6, exitThreshold: 0.3, retryMultiplier: 3 },
  onSafeMode:     (stats) => showBanner("Sending critical data only"),
  onSafeModeExit: ()      => hideBanner(),
});
```

### Low Network Mode

```js
await Novixo.init({
  lowNetwork: true,
  lowNetworkOptions: {
    stripFields:      ["metadata", "analytics"],
    compressStrings:  true,
    deferLowPriority: true,
  },
  onLowNetworkOn:  () => showDataSaverBanner(),
  onLowNetworkOff: () => hideDataSaverBanner(),
});
```

## Full API Reference

### Core

| Method | Description |
| --- | --- |
| `await Novixo.init(config)` | Initialize the engine |
| `await Novixo.send(data, priority?)` | Queue item — sends immediately if online |
| `await Novixo.sendTransaction(data)` | Send with exactly-once guarantee |
| `await Novixo.sendOptimistic(data, opts)` | Send with instant UI update |
| `await Novixo.syncNow()` | Manually trigger sync |
| `Novixo.destroy()` | Teardown engine |

### Network

| Method | Description |
| --- | --- |
| `Novixo.isOnline()` | True if not OFFLINE |
| `Novixo.getNetworkState()` | Current 4-state status |
| `Novixo.forceNetworkState(state)` | Override state (for testing) |
| `Novixo.isLowNetworkActive()` | True if low network mode is on |
| `Novixo.getLowNetworkStats()` | { isActive, deferredCount } |

### Queue

| Method | Description |
| --- | --- |
| `Novixo.getQueue()` | All queued items |
| `Novixo.queueSize()` | Number of items in queue |
| `await Novixo.clearQueue()` | Clear all items |
| `await Novixo.cancelItem(id)` | Remove item before sync |
| `await Novixo.updateItem(id, data)` | Update item payload before sync |
| `Novixo.hasItem(id)` | Check if item is still queued |
| `Novixo.getItem(id)` | Get item by ID |

### AI Request Manager (Phase 8)

| Method | Description |
| --- | --- |
| `ai.registerProvider(config)` | Register an AI provider |
| `await ai.request({ prompt, model?, provider? })` | Make an AI request with failover |
| `ai.on(event, fn)` | Listen to AI events |
| `ai.getStats()` | Per-provider success/failure/rate-limit counts |
| `await ai.processQueue()` | Replay offline-queued AI requests |

### Cache

| Method | Description |
| --- | --- |
| `await Novixo.cacheFetch(url, opts)` | Fetch + cache automatically |
| `await Novixo.cacheSet(key, value, ttl)` | Store in cache |
| `Novixo.cacheGet(key)` | Read from cache |
| `Novixo.cacheHas(key)` | Check if key exists |
| `await Novixo.cacheDelete(key)` | Remove one entry |
| `await Novixo.cacheClear()` | Clear all cache |
| `Novixo.getCacheStats()` | Active entries, keys, expiry |

### Events

| Method | Description |
| --- | --- |
| `Novixo.on(event, handler)` | Subscribe to engine event |
| `Novixo.once(event, handler)` | One-time subscription |
| `Novixo.off(event, handler)` | Remove listener |
| `Novixo.getRegisteredEvents()` | All active event names |
| `Novixo.listenerCount(event)` | Count listeners for event |

### Failover

| Method | Description |
| --- | --- |
| `await Novixo.fetchWithFailover(item)` | Fetch across fallback endpoints |
| `Novixo.getCurrentEndpoint()` | Active endpoint URL |
| `Novixo.getFailoverStats()` | { currentEndpoint, endpoints } |

### Service Worker

```js
import { registerNovixoSW, syncSW, getSWQueue, clearSWQueue, isSWActive } from "novixo-engine/sw";
```

| Method | Description |
| --- | --- |
| `await registerNovixoSW(opts)` | Register the service worker |
| `await syncSW()` | Trigger SW sync manually |
| `await getSWQueue()` | Get SW queue contents |
| `await clearSWQueue()` | Clear SW queue |
| `isSWActive()` | True if SW is controlling the page |

## Named Exports

```js
import Novixo, {
  Priority,         // HIGH | MEDIUM | LOW
  NetworkState,     // STABLE | DEGRADED | UNSTABLE | OFFLINE
  ConflictStrategy, // LAST_WRITE_WINS | CLIENT_WINS | SERVER_WINS | MANUAL
  DedupeStrategy,   // STRICT | TYPE | CUSTOM
  TxnState,         // PENDING | SENT | CONFIRMED | FAILED
  NovixoEvent,      // synced | failed | queued | network | ...
} from "novixo-engine";
```

## Who Is This For?

| Industry | Key features used |
| --- | --- |
| 💬 Chat apps | Optimistic UI, deduplication, ordered execution |
| 🏦 Fintech / Banking | Transaction integrity, encryption, safe mode |
| 🚚 Delivery apps | Ordered execution, flap guard, low network mode |
| 🤖 AI-powered apps | AI Request Manager, response cache, failover |
| 🏥 Healthcare | Encryption, transaction integrity, audit timeline |
| 🎓 EdTech | Offline queue, low network mode, cache |
| 🛒 E-commerce | Optimistic UI, deduplication, conflict resolution |
| 🌍 Any app with real-world users | All of the above |

## Roadmap

- ✅ Phase 1 — Offline queue engine
- ✅ Phase 2 — React Native / Expo adapter
- ✅ Phase 3 — Conflict resolution
- ✅ Phase 4a — 4-state network + priority + batching
- ✅ Phase 4b — npm package
- ✅ Phase 5a — Sync timeline
- ✅ Phase 5b — Deduplication
- ✅ Phase 5c — Network flap protection
- ✅ Phase 5d — Safe mode
- ✅ Phase 6a — TypeScript definitions
- ✅ Phase 6b — Exponential backoff
- ✅ Phase 6c — Request timeout
- ✅ Phase 6d — Queue cancel / edit
- ✅ Phase 6e — Optimistic UI
- ✅ Phase 7a — Service worker
- ✅ Phase 7b — Low network mode
- ✅ Phase 7c — Transaction integrity
- ✅ Phase 7d — Encrypted queue
- ✅ Phase 7e — Ordered execution
- ✅ Phase 7f — Response cache
- ✅ Phase 7g — Event emitter
- ✅ Phase 7h — Endpoint failover
- ✅ Phase 8 — AI Request Manager (multi-provider failover)

## Works great with novixo-agent-logger

Get a full audit trail of every AI request, rate-limit, failover, and offline queue event automatically.

```bash
npm install novixo-agent-logger
```
```js
import { AIRequestManager } from "novixo-engine";
import { AgentLogger } from "novixo-agent-logger";

const ai = new AIRequestManager();
const logger = new AgentLogger();

logger.attachToNovixoAI(ai);
// Every AI call, rate-limit, and failover is now automatically logged
```

[View novixo-agent-logger on npm](https://www.npmjs.com/package/novixo-agent-logger)

## License

MIT © NovixoTech (github.com/NovixoTech) 
