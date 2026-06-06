/**
 * index.d.ts — Novixo Engine
 * ────────────────────────────
 * Complete TypeScript type definitions.
 * Covers every public API, config option, callback, and named export.
 *
 * Usage:
 *   import Novixo, {
 *     Priority,
 *     NetworkState,
 *     ConflictStrategy,
 *     DedupeStrategy,
 *     SafeModeState,
 *     TimelineEvent,
 *     LogLevel,
 *   } from "novixo-engine";
 */

// ─────────────────────────────────────────────
// Enums / Constants
// ─────────────────────────────────────────────

export declare const Priority: {
  readonly HIGH:   "HIGH";
  readonly MEDIUM: "MEDIUM";
  readonly LOW:    "LOW";
};
export type Priority = typeof Priority[keyof typeof Priority];

export declare const NetworkState: {
  readonly STABLE:   "STABLE";
  readonly DEGRADED: "DEGRADED";
  readonly UNSTABLE: "UNSTABLE";
  readonly OFFLINE:  "OFFLINE";
};
export type NetworkState = typeof NetworkState[keyof typeof NetworkState];

export declare const ConflictStrategy: {
  readonly LAST_WRITE_WINS: "LAST_WRITE_WINS";
  readonly CLIENT_WINS:     "CLIENT_WINS";
  readonly SERVER_WINS:     "SERVER_WINS";
  readonly MANUAL:          "MANUAL";
};
export type ConflictStrategy = typeof ConflictStrategy[keyof typeof ConflictStrategy];

export declare const DedupeStrategy: {
  readonly STRICT: "strict";
  readonly TYPE:   "type";
  readonly CUSTOM: "custom";
};
export type DedupeStrategy = typeof DedupeStrategy[keyof typeof DedupeStrategy];

export declare const SafeModeState: {
  readonly NORMAL:    "NORMAL";
  readonly SAFE_MODE: "SAFE_MODE";
};
export type SafeModeState = typeof SafeModeState[keyof typeof SafeModeState];

export declare const TimelineEvent: {
  readonly ITEM_QUEUED:       "ITEM_QUEUED";
  readonly ITEM_SYNCED:       "ITEM_SYNCED";
  readonly ITEM_FAILED:       "ITEM_FAILED";
  readonly ITEM_SKIPPED:      "ITEM_SKIPPED";
  readonly ITEM_RETRY:        "ITEM_RETRY";
  readonly QUEUE_CLEARED:     "QUEUE_CLEARED";
  readonly CONFLICT_DETECTED: "CONFLICT_DETECTED";
  readonly CONFLICT_RESOLVED: "CONFLICT_RESOLVED";
  readonly NETWORK_CHANGED:   "NETWORK_CHANGED";
  readonly SYNC_STARTED:      "SYNC_STARTED";
  readonly SYNC_COMPLETE:     "SYNC_COMPLETE";
  readonly ENGINE_INIT:       "ENGINE_INIT";
  readonly ENGINE_DESTROYED:  "ENGINE_DESTROYED";
};
export type TimelineEvent = typeof TimelineEvent[keyof typeof TimelineEvent];

export declare const LogLevel: {
  readonly INFO:    "info";
  readonly SUCCESS: "success";
  readonly WARN:    "warn";
  readonly ERROR:   "error";
};
export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

// ─────────────────────────────────────────────
// Core data shapes
// ─────────────────────────────────────────────

export interface QueueItem {
  id:              string;
  type:            string;
  payload:         unknown;
  priority:        Priority;
  priorityWeight:  number;
  timestamp:       number;
  retries:         number;
  status:          "pending" | "failed";
}

export interface ConflictResponse {
  conflict:    true;
  serverItem:  QueueItem;
}

export type SyncHandlerResult = boolean | ConflictResponse;

export interface TimelineEntry {
  id:        string;
  timestamp: number;
  time:      string;
  date:      string;
  event:     TimelineEvent;
  message:   string;
  level:     LogLevel;
  meta:      Record<string, unknown>;
}

export interface TimelineSummary {
  total:   number;
  synced:  number;
  failed:  number;
  queued:  number;
  retries: number;
}

export interface FlapStats {
  flapCount:      number;
  history:        Array<{ state: string; timestamp: number }>;
  isStabilizing:  boolean;
  stabilityMs:    number;
}

export interface SafeModeStats {
  state:           SafeModeState;
  isInSafeMode:    boolean;
  failureRate:     string;
  failureRateRaw:  number;
  windowSize:      number;
  windowFails:     number;
  totalSynced:     number;
  totalFailed:     number;
  enteredAt:       number | null;
  exitedAt:        number | null;
  retryMultiplier: number;
}

// ─────────────────────────────────────────────
// Retry delay map
// ─────────────────────────────────────────────

export interface RetryDelayMap {
  STABLE?:   number;
  DEGRADED?: number;
  UNSTABLE?: number;
  OFFLINE?:  number;
}

// ─────────────────────────────────────────────
// Sub-config types
// ─────────────────────────────────────────────

export interface DedupeOptions {
  strategy?: DedupeStrategy;
  windowMs?: number;
  keyFn?:    ((item: QueueItem) => string) | null;
}

export interface FlapGuardOptions {
  stabilityMs?: number;
  maxFlaps?:    number;
}

export interface SafeModeOptions {
  window?:          number;
  enterThreshold?:  number;
  exitThreshold?:   number;
  retryMultiplier?: number;
}

export interface TimelineOptions {
  maxEntries?: number;
  onEntry?:    ((entry: TimelineEntry) => void) | null;
}

export interface BatchConfig {
  maxBatchSize?:      number;
  degradedBatchSize?: number;
  unstableBatchSize?: number;
}

export interface QualityConfig {
  stableMs?:          number;
  degradedMs?:        number;
  pingUrl?:           string;
  pingInterval?:      number;
  pingTimeout?:       number;
  failureWindow?:     number;
  unstableFailRate?:  number;
}

// ─────────────────────────────────────────────
// Main config
// ─────────────────────────────────────────────

export interface NovixoConfig {
  // ── Required ──
  syncHandler: (item: QueueItem) => Promise<SyncHandlerResult>;

  // ── Core ──
  platform?:      "web" | "mobile" | null;
  autoSync?:      boolean;

  // ── Retry ──
  retryLimit?:  number;
  retryDelay?:  RetryDelayMap;

  // ── Priority ──
  defaultPriority?: Priority;

  // ── Batching ──
  batchSyncHandler?: (items: QueueItem[]) => Promise<boolean[]>;
  batchConfig?:      BatchConfig;

  // ── Network quality ──
  qualityConfig?: QualityConfig;

  // ── Conflict resolution ──
  conflictStrategy?:   ConflictStrategy;
  onConflict?:         ((clientItem: QueueItem, serverItem: QueueItem) => Promise<QueueItem>) | null;
  onConflictResolved?: ((resolvedItem: QueueItem, strategy: ConflictStrategy) => void) | null;

  // ── Timeline ──
  timeline?:        boolean;
  timelineOptions?: TimelineOptions;

  // ── Deduplication ──
  dedupe?:        boolean;
  dedupeOptions?: DedupeOptions;
  onDuplicate?:   ((item: QueueItem, originalId: string) => void) | null;

  // ── Flap guard ──
  flapGuard?:        boolean;
  flapGuardOptions?: FlapGuardOptions;
  onFlap?:           ((flapCount: number, history: FlapStats["history"]) => void) | null;
  onStable?:         (() => void) | null;

  // ── Safe mode ──
  safeMode?:        boolean;
  safeModeOptions?: SafeModeOptions;
  onSafeMode?:      ((stats: SafeModeStats) => void) | null;
  onSafeModeExit?:  ((stats: SafeModeStats) => void) | null;

  // ── Callbacks ──
  onSyncSuccess?:        ((item: QueueItem) => void) | null;
  onSyncFailure?:        ((item: QueueItem, error: Error) => void) | null;
  onQueueChange?:        ((size: number) => void) | null;
  onNetworkStateChange?: ((newState: NetworkState, oldState: NetworkState) => void) | null;
}

// ─────────────────────────────────────────────
// Data input type for send()
// ─────────────────────────────────────────────

export interface SendData {
  type:     string;
  payload?: unknown;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────
// Optimistic UI types (Phase 6e)
// ─────────────────────────────────────────────

export interface OptimisticOptions<T> {
  /** Instant local state update — runs before sync */
  onOptimistic: (tempId: string, data: T) => void;
  /** Runs when server confirms success */
  onConfirmed?: (tempId: string, item: QueueItem) => void;
  /** Runs if sync fails — revert your UI here */
  onReverted?:  (tempId: string, error: Error) => void;
  /** Priority for this send */
  priority?:    Priority;
}

// ─────────────────────────────────────────────
// Main Novixo Engine interface
// ─────────────────────────────────────────────

export interface NovixoEngine {
  // ── Core ──
  init(config: NovixoConfig): Promise<void>;
  send(data: SendData, priority?: Priority): Promise<string>;
  syncNow(): Promise<void>;
  destroy(): void;

  // ── Network ──
  isOnline(): boolean;
  getNetworkState(): NetworkState;
  forceNetworkState(state: NetworkState): void;

  // ── Queue ──
  getQueue(): QueueItem[];
  queueSize(): number;
  clearQueue(): Promise<void>;

  // ── Queue management (Phase 6d) ──
  cancelItem(id: string): Promise<boolean>;
  updateItem(id: string, newData: Partial<SendData>): Promise<boolean>;

  // ── Optimistic UI (Phase 6e) ──
  sendOptimistic<T extends SendData>(data: T, options: OptimisticOptions<T>): Promise<string>;

  // ── Timeline ──
  getTimeline(): TimelineEntry[];
  getItemTimeline(itemId: string): TimelineEntry[];
  getTimelineByEvent(event: TimelineEvent): TimelineEntry[];
  getTimelineByLevel(level: LogLevel): TimelineEntry[];
  getTimelineIssues(): TimelineEntry[];
  getTimelineSummary(): TimelineSummary;
  clearTimeline(): void;
  exportTimeline(): string;
  onTimelineEntry(callback: (entry: TimelineEntry) => void): void;

  // ── Deduplication ──
  getFingerprintCount(): number;
  clearFingerprints(): void;

  // ── Flap guard ──
  getFlapStats(): FlapStats;

  // ── Safe mode ──
  isInSafeMode(): boolean;
  getSafeModeStats(): SafeModeStats;
}

// ─────────────────────────────────────────────
// Default export
// ─────────────────────────────────────────────

declare const Novixo: NovixoEngine;
export default Novixo;