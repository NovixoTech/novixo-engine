/**
 * demo/NovixoDemo.jsx — Novixo Sync
 * ────────────────────────────────────
 * Expo demo screen showing Novixo Sync working on mobile.
 *
 * HOW TO USE:
 *   1. Create a new Expo project:
 *        npx create-expo-app NovixoDemo
 *        cd NovixoDemo
 *
 *   2. Install AsyncStorage:
 *        expo install @react-native-async-storage/async-storage
 *
 *   3. Copy the novixo-sync folder into your project
 *
 *   4. Replace App.js content with:
 *        import NovixoDemo from "./demo/NovixoDemo";
 *        export default NovixoDemo;
 *
 *   5. Run:
 *        npx expo start
 *        Scan QR code with Expo Go app on your phone
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  Switch,
} from "react-native";

import Novixo from "../index.js";

// ─────────────────────────────────────────────
// Fake sync handler — simulates sending to a server
// Replace with your real API call in production
// ─────────────────────────────────────────────
const fakeSyncHandler = async (item) => {
  // Simulate network delay
  await new Promise((res) => setTimeout(res, 800));
  // Simulate 90% success rate
  return Math.random() > 0.1;
};

// ─────────────────────────────────────────────
// Demo Screen
// ─────────────────────────────────────────────
export default function NovixoDemo() {
  const [ready, setReady] = useState(false);
  const [simulateOffline, setSimulateOffline] = useState(false);
  const [queue, setQueue] = useState([]);
  const [log, setLog] = useState([]);
  const [syncing, setSyncing] = useState(false);

  // ── Init Novixo on mount ──
  useEffect(() => {
    (async () => {
      await Novixo.init({
        platform: "mobile",
        syncHandler: fakeSyncHandler,

        onSyncSuccess: (item) => {
          addLog(`✅ Synced: ${item.id}`);
          setQueue(Novixo.getQueue());
        },

        onSyncFailure: (item, err) => {
          addLog(`❌ Failed: ${item.id} — ${err.message}`);
          setQueue(Novixo.getQueue());
        },

        onQueueChange: (size) => {
          addLog(`📦 Queue: ${size} item(s)`);
          setQueue(Novixo.getQueue());
        },
      });

      setQueue(Novixo.getQueue());
      setReady(true);
      addLog("🚀 Novixo Sync initialized");
    })();
  }, []);

  // ── Add a log entry ──
  function addLog(message) {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [`[${time}] ${message}`, ...prev].slice(0, 30));
  }

  // ── Send a test action ──
  async function handleSend() {
    if (simulateOffline) {
      // Pretend we're offline — queue directly without sending
      const id = await Novixo.send({
        type: "message",
        payload: {
          text: `Offline message at ${Date.now()}`,
          userId: "demo_user",
        },
      });
      addLog(`📴 Queued offline: ${id}`);
    } else {
      const id = await Novixo.send({
        type: "message",
        payload: {
          text: `Online message at ${Date.now()}`,
          userId: "demo_user",
        },
      });
      addLog(`📤 Sent: ${id}`);
    }
    setQueue(Novixo.getQueue());
  }

  // ── Manual sync ──
  async function handleSync() {
    setSyncing(true);
    addLog("🔄 Manual sync started...");
    await Novixo.syncNow();
    setQueue(Novixo.getQueue());
    setSyncing(false);
    addLog("🔄 Manual sync complete");
  }

  // ── Clear queue ──
  async function handleClear() {
    await Novixo.clearQueue();
    setQueue([]);
    addLog("🗑️ Queue cleared");
  }

  if (!ready) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loading}>Initializing Novixo Sync...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Novixo Sync</Text>
        <Text style={styles.subtitle}>Offline-First SDK Demo</Text>
      </View>

      {/* Network toggle */}
      <View style={styles.networkBar}>
        <Text style={styles.networkLabel}>
          {simulateOffline ? "📴 Simulating Offline" : "🌐 Online"}
        </Text>
        <Switch
          value={simulateOffline}
          onValueChange={setSimulateOffline}
          trackColor={{ false: "#4CAF50", true: "#F44336" }}
          thumbColor="#fff"
        />
      </View>

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleSend}>
          <Text style={styles.btnText}>
            {simulateOffline ? "📴 Send (Offline)" : "📤 Send"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, syncing && styles.btnDisabled]}
          onPress={handleSync}
          disabled={syncing}
        >
          <Text style={styles.btnText}>
            {syncing ? "⏳ Syncing..." : "🔄 Sync Now"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnDanger} onPress={handleClear}>
          <Text style={styles.btnText}>🗑️ Clear</Text>
        </TouchableOpacity>
      </View>

      {/* Queue count */}
      <View style={styles.queueHeader}>
        <Text style={styles.sectionTitle}>
          Queue ({queue.length} item{queue.length !== 1 ? "s" : ""})
        </Text>
      </View>

      {/* Queue list */}
      {queue.length === 0 ? (
        <Text style={styles.emptyText}>Queue is empty</Text>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          style={styles.queueList}
          renderItem={({ item }) => (
            <View style={styles.queueItem}>
              <View style={styles.queueItemLeft}>
                <Text style={styles.queueItemType}>{item.type}</Text>
                <Text style={styles.queueItemId} numberOfLines={1}>
                  {item.id}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  item.status === "pending" && styles.statusPending,
                  item.status === "failed" && styles.statusFailed,
                ]}
              >
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>
          )}
        />
      )}

      {/* Activity log */}
      <Text style={styles.sectionTitle}>Activity Log</Text>
      <FlatList
        data={log}
        keyExtractor={(_, i) => String(i)}
        style={styles.logList}
        renderItem={({ item }) => (
          <Text style={styles.logEntry}>{item}</Text>
        )}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f0f",
    paddingHorizontal: 16,
  },
  loading: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 100,
    fontSize: 16,
  },
  header: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  networkBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 12,
  },
  networkLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnDanger: {
    flex: 1,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  queueHeader: {
    marginBottom: 8,
  },
  sectionTitle: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  emptyText: {
    color: "#444",
    fontSize: 13,
    marginBottom: 16,
  },
  queueList: {
    maxHeight: 160,
    marginBottom: 16,
  },
  queueItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  queueItemLeft: {
    flex: 1,
  },
  queueItemType: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  queueItemId: {
    color: "#555",
    fontSize: 10,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: "#333",
  },
  statusPending: {
    backgroundColor: "#1d4ed8",
  },
  statusFailed: {
    backgroundColor: "#7f1d1d",
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  logList: {
    flex: 1,
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 10,
  },
  logEntry: {
    color: "#4ade80",
    fontSize: 11,
    fontFamily: "monospace",
    marginBottom: 3,
  },
});
