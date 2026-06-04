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
