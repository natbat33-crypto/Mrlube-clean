"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { getStoreId } from "@/lib/getStoreId";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

/* ----------------------------------
   TYPES
---------------------------------- */
type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
  done?: boolean;
  approved?: boolean;
  lastMs?: number;
  bestMs?: number;
  avgMs?: number;
  count?: number;
};

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

function msToClock(ms?: number): string {
  if (ms == null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/* ----------------------------------
   MAIN
---------------------------------- */
export default function Week4Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [week3Approved, setWeek3Approved] = useState<boolean | null>(null);

  const [baseTasks, setBaseTasks] = useState<Task[]>([]);
  const [statsById, setStatsById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  /* ----------------------------------
     AUTH
  ---------------------------------- */
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
  }, []);

  /* ----------------------------------
     WEEK 3 GATE
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid, "sections", "week3"), (snap) => {
      setWeek3Approved(snap.exists() && snap.data()?.approved === true);
    });
  }, [uid]);

  /* ----------------------------------
     LOAD TASK TEMPLATES
  ---------------------------------- */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, "modules", "week4", "tasks"), orderBy("order", "asc"))
      );
      setBaseTasks(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Partial<Task>),
        }))
      );
      setLoading(false);
    })();
  }, []);

  /* ----------------------------------
     LIVE PROGRESS STATS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || !baseTasks.length) return;

    const unsubs = baseTasks.map((t) => {
      const key = `modules__week4__tasks__${t.id}`;
      return onSnapshot(doc(db, "users", uid, "progress", key), (snap) => {
        setStatsById((p) => ({ ...p, [t.id]: snap.data() || {} }));
      });
    });

    return () => unsubs.forEach((u) => u());
  }, [uid, baseTasks]);

  const tasks = useMemo(() => {
    return baseTasks.map((t, i) => {
      const s = statsById[t.id] || {};
      const order = t.order ?? t.sort_order ?? i + 1;
      return {
        ...t,
        order,
        done: !!s.done,
        approved: !!s.approved,
        lastMs: s.lastMs,
        bestMs: s.bestMs,
        avgMs: s.avgMs,
        count: s.count,
      };
    });
  }, [baseTasks, statsById]);

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  /* ----------------------------------
     TOGGLE (NON-APPROVAL TASKS ONLY)
  ---------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;
    const storeId = await getStoreId();
    const key = `modules__week4__tasks__${id}`;

    await setDoc(
      doc(db, "users", uid, "progress", key),
      {
        week: "week4",
        done: next,
        storeId: storeId || "",
        traineeId: uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (authLoading || loading || week3Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  const locked = !week3Approved;

  /* ----------------------------------
     UI (Week-1 MIRROR)
  ---------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <Link
        href="/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#fff",
          border: `1px solid ${GRAY}`,
          borderRadius: 999,
          padding: "8px 14px",
          fontWeight: 600,
          color: NAVY,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        ← Back to Dashboard
      </Link>

      <h2>Week 4</h2>

      <div style={{ fontSize: 14, marginBottom: 6 }}>
        {doneCount}/{tasks.length} completed ({pct}%)
      </div>

      <div
        style={{
          height: 12,
          background: "#d9d9df",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: YELLOW }} />
      </div>

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {tasks.map((t) => {
          const isApprovalTask = t.order === 1;
          const done = t.done;

          return (
            <li
              key={t.id}
              style={{
                display: "flex",
                gap: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fff",
                border: `1px solid ${done ? "#d6ead8" : GRAY}`,
                position: "relative",
                opacity: locked ? 0.6 : 1,
                pointerEvents: locked ? "none" : "auto",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 5,
                  background: done ? GREEN : "transparent",
                  borderTopLeftRadius: 12,
                  borderBottomLeftRadius: 12,
                }}
              />

              {!isApprovalTask && (
                <button
                  onClick={() => toggleTask(t.id, !done)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: `2px solid ${done ? GREEN : "#9aa0a6"}`,
                    background: done ? GREEN : "#fff",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    stroke={done ? "#fff" : "transparent"}
                    strokeWidth="3"
                    fill="none"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </button>
              )}

              <div>
                <div style={{ fontWeight: 600 }}>
                  {t.order}. {t.title}
                </div>

                {isApprovalTask ? (
                  <div style={{ fontSize: 12, color: "#5f6368" }}>
                    {t.approved ? "Approved ✓" : "Waiting for supervisor approval"}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#5f6368" }}>
                    Last: {msToClock(t.lastMs)} • Best: {msToClock(t.bestMs)} • Avg:{" "}
                    {msToClock(t.avgMs)} • Runs: {t.count ?? 0}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}


