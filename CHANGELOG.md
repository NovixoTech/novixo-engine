# Changelog

---

## [3.0.0] — Phase 7 — Enterprise & Platform Layer

### Phase 7a — Service Worker
- `novixo-sw.js` — intercepts every fetch() automatically, zero code changes needed
- Background sync — replays queue even when the tab is closed
- Synthetic 202 responses — app never crashes offline
- `sw.js` entry point — `import { registerNovixoSW } from "novixo-engine/sw"`
- `registerNovixoSW()`, `syncSW()`, `getSWQueue()`, `clearSWQueue()`, `isSWActive()`

### Phase 7b — Low Network Mode
- Auto-activates on DEGRADED or UNSTABLE networks
- Strips non-essential payload fields
- Compresses string values (removes nulls, trims whitespace)
- Defers LOW priority items until STABLE network returns
- `onLowNetworkOn` / `onLowNetworkOff` callbacks
- `Novixo.isLowNetworkActive()`, `Novixo.getLowNetworkStats()`

### Phase 7c — Transaction Integrity (Exactly-Once Delivery)
- Idempotency keys — same transaction never processed twice
- Stable key derived from type + payload content
- Survives app crashes, restarts, network drops
- `Novixo.sendTransaction(data)` — HIGH priority with idempotency
- `Novixo.getPendingTransactions()` — unconfirmed transactions
- `TxnState` export: PENDING, SENT, CONFIRMED, FAILED
- `transactions: true` in config to enable (opt-in)

### Phase 7d — Encrypted Queue (AES-256-GCM)
- Queue items encrypted before IndexedDB write
- Decrypted only when syncing — dev tools show gibberish
- AES-256-GCM — bank and military grade
- Key derived via PBKDF2 (100,000 iterations)
- `encryption: true` + `encryptionKey: "..."` in config
- `Novixo.isEncryptionReady()`

### Phase 7e — Ordered Execution
- Dependency-aware queue — items declare what must sync first
- `await Novixo.send({ type: "pickup", dependsOn: [acceptId] })`
- Items with unmet deps held back automatically
- `orderedExecution: true` by default

### Phase 7f — Response Cache
- `Novixo.cacheFetch(url, { ttl })` — fetch + auto-cache
- `Novixo.cacheSet(key, value, ttlMs)` / `cacheGet(key)`
- Memory + IndexedDB persistence across sessions
- TTL-based expiry — stale entries auto-removed
- `getCacheStats()` — active entries, keys, expiry info
- `cache: true` by default

### Phase 7g — Event Emitter
- `Novixo.on("synced", handler)` — subscribe to any engine event
- `Novixo.once("synced", handler)` — one-time listener
- `Novixo.off("synced", handler)` — remove listener
- `NovixoEvent` constants: synced, failed, queued, retry,
  network, safemode:on, safemode:off, lownetwork:on,
  lownetwork:off, conflict, duplicate, timeout, queue:change,
  init, destroy
- `getRegisteredEvents()`, `listenerCount(event)`

### Phase 7h — Endpoint Failover
- Multiple server endpoints with automatic failover
- Primary fails → tries backup → tries fallback
- Background health checks — auto-recovers when primary returns
- `Novixo.fetchWithFailover(item, { endpoints: [...] })`
- `endpoints: [url1, url2, url3]` in config
- `Novixo.getFailoverStats()`, `Novixo.getCurrentEndpoint()`

---

## [2.0.0] — Phase 6 — Enterprise Layer
- TypeScript definitions (index.d.ts)
- Exponential backoff
- Request timeout + auto-queue fallback
- Queue cancel / edit
- Optimistic UI helper

## [1.4.0] — Phase 5d — Safe Mode
## [1.3.0] — Phase 5c — Network Flap Protection
## [1.2.0] — Phase 5b — Deduplication Engine
## [1.1.0] — Phase 5a — Sync Timeline
## [1.0.0] — Phase 4b — Initial npm release
## [0.4.0] — Phase 4a — 4-state network + priority + batching
## [0.3.0] — Phase 3  — Conflict resolution
## [0.2.0] — Phase 2  — React Native adapter
## [0.1.0] — Phase 1  — Offline queue core
