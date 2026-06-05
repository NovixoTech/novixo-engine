# Changelog

---

## [1.1.0] — Phase 5a — Sync Timeline

### Added
- **Sync Timeline** — full activity log for every SDK event
- `Novixo.getTimeline()` — all entries, newest first
- `Novixo.getItemTimeline(itemId)` — history for a specific item
- `Novixo.getTimelineByEvent(event)` — filter by event type
- `Novixo.getTimelineByLevel(level)` — filter by log level
- `Novixo.getTimelineIssues()` — errors and warnings only
- `Novixo.getTimelineSummary()` — { total, synced, failed, queued, retries }
- `Novixo.exportTimeline()` — JSON string for bug reports
- `Novixo.clearTimeline()` — reset the log
- `Novixo.onTimelineEntry(cb)` — live callback on every new entry
- `TimelineEvent` and `LogLevel` named exports
- `timelineOptions.onEntry` config — fires on every new entry
- `timeline: false` config — disable logging entirely

### Timeline events tracked
- ENGINE_INIT, ENGINE_DESTROYED
- ITEM_QUEUED, ITEM_SYNCED, ITEM_FAILED, ITEM_SKIPPED, ITEM_RETRY
- CONFLICT_DETECTED, CONFLICT_RESOLVED
- NETWORK_CHANGED, SYNC_STARTED, SYNC_COMPLETE, QUEUE_CLEARED

---

## [1.0.0] — Initial Public Release
- 4-State Network Engine (STABLE / DEGRADED / UNSTABLE / OFFLINE)
- Priority Queue (HIGH / MEDIUM / LOW)
- Smart Batching
- Conflict Resolution
- IndexedDB + AsyncStorage adapters
- CommonJS + ESM support

---

## [0.4.0] — Phase 4a (pre-release)
- 4-state network quality detection
- Priority-aware sync + request batching

## [0.3.0] — Phase 3 (pre-release)
- Conflict resolution engine

## [0.2.0] — Phase 2 (pre-release)
- React Native / Expo AsyncStorage adapter

## [0.1.0] — Phase 1 (pre-release)
- Offline queue, network detection, auto-retry, IndexedDB

---

## [1.2.0] — Phase 5b — Deduplication Engine

### Added
- **Deduplication Engine** — prevents duplicate items from entering the queue
- Three strategies: `STRICT` (type + payload), `TYPE` (type only), `CUSTOM` (your key function)
- Configurable time window (`windowMs`) — default 5 seconds
- `onDuplicate` callback — fires when a duplicate is detected
- `DedupeStrategy` named export
- `Novixo.getFingerprintCount()` — debug how many fingerprints are active
- `Novixo.clearFingerprints()` — reset deduplication state
- Fingerprints automatically released when items sync successfully
- Timeline events updated to log duplicate drops as `ITEM_SKIPPED`
- `dedupe: false` config option to disable entirely

---

## [1.3.0] — Phase 5c — Network Flap Protection

### Added
- **Flap Guard** — prevents sync from firing on unstable, flapping networks
- Configurable `stabilityMs` — how long network must stay stable before syncing (default 3s)
- `onFlap` callback — fires every time a flap is detected, with count and history
- `onStable` callback — fires when network is genuinely stable and sync is safe
- `Novixo.getFlapStats()` — `{ flapCount, history, isStabilizing, stabilityMs }`
- `flapGuard: false` config option to disable entirely
- Timeline now logs flap events and stability confirmations
- `flapGuardOptions.maxFlaps` — how many flap events to keep in history (default 10)

---

## [1.4.0] — Phase 5d — Safe Mode System — COMPLETE

### Added
- **Safe Mode** — auto-activates when failure rate exceeds threshold
- Rolling window failure tracking (default: last 10 attempts)
- `enterThreshold` — failure rate to enter safe mode (default: 60%)
- `exitThreshold` — failure rate to exit safe mode (default: 30%)
- `retryMultiplier` — retry delays multiplied in safe mode (default: 3x)
- `onSafeMode` callback — fires when safe mode activates, with full stats
- `onSafeModeExit` callback — fires when safe mode recovers
- `Novixo.isInSafeMode()` — boolean check
- `Novixo.getSafeModeStats()` — `{ state, failureRate, totalSynced, totalFailed, ... }`
- `SafeModeState` named export (`NORMAL` | `SAFE_MODE`)
- `safeMode: false` config option to disable
- In safe mode: only HIGH priority items sync
- In safe mode: batch sync disabled — careful one-by-one only
- In safe mode: retry delays multiplied automatically
- Auto-recovery when failure rate drops below exitThreshold

### Phase 5 Complete
All Phase 5 modules now active:
- 5a: Sync Timeline
- 5b: Deduplication Engine
- 5c: Network Flap Protection
- 5d: Safe Mode System

---

## [2.0.0] — Phase 6 — Enterprise Layer

### Added

**6a — TypeScript Definitions**
- Complete `index.d.ts` covering every config option, callback, method, and type
- `NovixoConfig`, `QueueItem`, `SendData`, `OptimisticOptions` interfaces
- All enums typed: `Priority`, `NetworkState`, `ConflictStrategy`, `DedupeStrategy`, `SafeModeState`, `TimelineEvent`, `LogLevel`
- `package.json` now includes `"types": "index.d.ts"`

**6b — Exponential Backoff**
- `backoff.js` — calculates smart retry delays per attempt
- Formula: `min(baseDelay * 2^attempt, maxDelay) + jitter`
- Attempt 1→1s, 2→2s, 3→4s, 4→8s, 5→16s, capped at 30s
- Jitter prevents thundering herd (1000 clients retrying simultaneously)
- `backoffOptions` config: `baseDelay`, `maxDelay`, `multiplier`, `jitter`
- `backoff: false` to disable

**6c — Request Timeout + Auto-Queue Fallback**
- `timeout.js` — wraps every syncHandler call with a configurable timeout
- If handler hangs beyond `timeoutMs` (default 10s) → cancelled + re-queued
- `NovixoTimeoutError` custom error class
- `onTimeout` callback — fires when an item times out
- `timeout: false` to disable

**6d — Queue Cancel / Edit**
- `queue-manager.js` — cancel and update items before they sync
- `Novixo.cancelItem(id)` — remove item permanently
- `Novixo.updateItem(id, newData)` — replace payload + reset retries
- `Novixo.hasItem(id)` — check if item is still queued
- `Novixo.getItem(id)` — retrieve item by ID

**6e — Optimistic UI Helper**
- `optimistic.js` — instant UI updates with background sync + auto-revert
- `Novixo.sendOptimistic(data, { onOptimistic, onConfirmed, onReverted })`
- UI updates immediately via `onOptimistic`
- `onConfirmed` fires when server confirms
- `onReverted` fires if sync fails — revert your UI cleanly
- `Novixo.getPendingOptimisticCount()` — how many optimistic items are in flight
