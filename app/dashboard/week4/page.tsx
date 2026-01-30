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
  deleteField,
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
  lastMs?: number;
  bestMs?: number;
  avgMs?: number;
  count?: number;
};

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
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

  // 🔒 Week 3 authority
  const [week3Approved, setWeek3Approved] = useState<boolean | null>(null);

  const [baseTasks, setBaseTasks] = useState<Task[]>([]);
  const [statsById, setStatsById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  /* ----------------------------------
     AUTH
  ---------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ----------------------------------
     🔒 WEEK 3 AUTHORITY (LIVE)
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid, "sections", "week3");
    const unsub = onSnapshot(ref, (snap) => {
      setWeek3Approved(snap.exists() && snap.data()?.approved === true);
    });
    return unsub;
  }, [uid]);

  /* ----------------------------------
     LOAD WEEK 4 TASK TEMPLATES
  ---------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const qy = query(
          collection(db, "modules", "week4", "tasks"),
          orderBy("order", "asc")
        );
        const snap = await getDocs(qy);
        const list: Task[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Partial<Task>),
          done: false,
        }));
        if (alive) setBaseTasks(list);
      } catch (e: any) {
        if (alive) {
          setErr(e?.message ?? String(e));
          setBaseTasks([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ----------------------------------
     LIVE PER-TASK STATS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || !baseTasks.length) return;

    const unsubs = baseTasks.map((t) => {
      const key = `modules__week4__tasks__${t.id}`;
      return onSnapshot(doc(db, "users", uid, "progress", key), (snap) => {
        setStatsById((prev) => ({ ...prev, [t.id]: snap.data() || {} }));
      });
    });

    return () => unsubs.forEach((u) => u());
  }, [uid, baseTasks]);

  const tasks: Task[] = useMemo(() => {
    return baseTasks.map((t, idx) => {
      const s = statsById[t.id] || {};
      return {
        ...t,
        order: t.order ?? t.sort_order ?? idx + 1,
        done: !!s.done,
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
     TOGGLE DONE
  ---------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;

    setStatsById((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), done: next },
    }));

    try {
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
    } catch {
      setStatsById((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), done: !next },
      }));
    }
  }

  /* ----------------------------------
     AUTO-CREATE SECTION (COMPLETE ONLY)
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;
    const allDone = tasks.length > 0 && tasks.every((t) => t.done);
    if (!allDone) return;

    setDoc(
      doc(db, "users", uid, "sections", "week4"),
      {
        completed: true,
        completedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [uid, tasks]);

  if (authLoading || loading || week3Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  const locked = week3Approved === false;

  /* ----------------------------------
     UI — MIRRORED FROM WEEK 1
  ---------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
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
            textDecoration: "none",
            color: NAVY,
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>

      {locked && (
        <div
          style={{
            background: "#f1f3f4",
            border: "1px solid #dadce0",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 600,
            color: "#5f6368",
          }}
        >
          Complete and get Week 3 approved to unlock Week 4.
        </div>
      )}

      <h2 style={{ marginBottom: 6, opacity: locked ? 0.6 : 1 }}>
        Week 4 — Timed Tasks
      </h2>

      <div style={{ fontSize: 14, marginBottom: 6, opacity: locked ? 0.6 : 1 }}>
        {doneCount}/{tasks.length} completed ({pct}%)
      </div>

      <div
        style={{
          height: 12,
          background: "#d9d9df",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 18,
          opacity: locked ? 0.5 : 1,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: YELLOW,
          }}
        />
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          display: "grid",
          gap: 10,
          opacity: locked ? 0.6 : 1,
          pointerEvents: locked ? "none" : "auto",
        }}
      >
        {tasks.map((t, index) => {
          const order = t.order ?? t.sort_order ?? index + 1;
          const done = t.done;

          return (
            <li
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fff",
                border: `1px solid ${done ? "#d6ead8" : GRAY}`,
                position: "relative",
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
                  cursor: "pointer",
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

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ fontWeight: 600 }}>
                  {order}. {t.title ?? t.id}
                </div>

                <div style={{ fontSize: 12, color: "#5f6368" }}>
                  Last: {msToClock(t.lastMs)} • Best: {msToClock(t.bestMs)} • Avg:{" "}
                  {msToClock(t.avgMs)} • Runs: {t.count ?? 0}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}





