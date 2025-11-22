"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  serverTimestamp,
  deleteField,
  onSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { getStoreId } from "@/lib/getStoreId";

type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
  required?: boolean;
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
  if (ms === undefined || ms === null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Week4Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [baseTasks, setBaseTasks] = useState<Task[]>([]);
  const [statsById, setStatsById] = useState<
    Record<
      string,
      {
        lastMs?: number;
        bestMs?: number;
        avgMs?: number;
        count?: number;
        done?: boolean;
        approved?: boolean;
      }
    >
  >({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // who is logged in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // load Week 4 task templates (strip shared "done")
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const qy = query(
          collection(db, "modules", "week4", "tasks"),
          orderBy("order", "asc")
        );
        const snap = await getDocs(qy);
        const list: Task[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const { done, ...rest } = data || {}; // 🚫 no shared done
            return { id: d.id, ...(rest as Partial<Task>) };
          })
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order) - num(b.order ?? b.sort_order)
          );
        if (alive) {
          setBaseTasks(list);
          setErr(null);
        }
      } catch (e: any) {
        if (alive) {
          console.error("[Week4] load error:", e);
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

  // live per-user stats + done/approved
  useEffect(() => {
    if (!uid || !baseTasks.length) return;
    const unsubs = baseTasks.map((t) => {
      const key = `modules__week4__tasks__${t.id}`;
      return onSnapshot(doc(db, "users", uid, "progress", key), (snap) => {
        const d = snap.data() || {};
        setStatsById((prev) => ({
          ...prev,
          [t.id]: {
            lastMs: d.lastMs,
            bestMs: d.bestMs,
            avgMs: d.avgMs,
            count: d.count,
            done: d.done,
            approved: d.approved,
          },
        }));
      });
    });
    return () => unsubs.forEach((u) => u && u());
  }, [uid, baseTasks]);

  const tasks: Task[] = useMemo(() => {
    return baseTasks.map((t, idx) => {
      const s = statsById[t.id] || {};
      return {
        ...t,
        order: t.order ?? t.sort_order ?? idx + 1,
        done: s.done ?? t.done,
        lastMs: s.lastMs ?? t.lastMs,
        bestMs: s.bestMs ?? t.bestMs,
        avgMs: s.avgMs ?? t.avgMs,
        count: s.count ?? t.count,
      };
    });
  }, [baseTasks, statsById]);

  const doneCount = useMemo(
    () => tasks.filter((t) => t.done).length,
    [tasks]
  );
  const pct = useMemo(
    () => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0),
    [doneCount, tasks.length]
  );

  // per-user toggle
  async function toggleTask(id: string, next: boolean) {
    if (!uid) {
      alert("Please log in to save your progress.");
      return;
    }

    // optimistic
    setStatsById((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), done: next },
    }));

    try {
      // optional shared flag (ignored by template load)
      try {
        await setDoc(
          doc(db, "modules", "week4", "tasks", id),
          { done: next, completedAt: next ? serverTimestamp() : deleteField() },
          { merge: true }
        );
      } catch {
        await updateDoc(doc(db, "modules", "week4", "tasks", id), {
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
        }).catch(() => {});
      }

      const path = `modules/week4/tasks/${id}`;
      const key = path.replace(/\//g, "__");
      const t = tasks.find((x) => x.id === id);
      const storeId = await getStoreId();

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          path,
          storeId: storeId || "",
          traineeId: uid,
          createdBy: uid,
          week: "week4",
          title: t?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // rollback
      setStatsById((prev) => ({
        ...prev,
        [id]: { ...(prev[id] || {}), done: !next },
      }));
      alert("Failed to save. Check Firestore rules and try again.");
    }
  }

  if (authLoading || loading)
    return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            background: "#fff",
            border: `1px solid ${GRAY}`,
            borderRadius: 999,
            padding: "8px 14px",
            fontWeight: 600,
            color: NAVY,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <span aria-hidden>←</span> Back to Dashboard
        </Link>
      </div>

      <h2 style={{ margin: "0 0 6px 0" }}>Week 4 — Timed Tasks</h2>
      <div style={{ fontSize: 14, marginBottom: 6, color: "#000" }}>
        {doneCount}/{tasks.length} completed ({pct}%)
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{
          height: 12,
          width: "100%",
          background: "#d9d9df",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: YELLOW,
            transition: "width 220ms ease",
          }}
        />
      </div>

      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 10,
        }}
      >
        {tasks.map((t, idx) => {
          const order = t.order ?? t.sort_order ?? idx + 1;
          const done = !!t.done;
          const stats = statsById[t.id] || {};
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
                boxShadow: done
                  ? "0 1px 2px rgba(0,0,0,0.04)"
                  : "0 1px 2px rgba(0,0,0,0.03)",
                position: "relative",
              }}
            >
              <span
                aria-hidden
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
                aria-label={done ? "Mark incomplete" : "Mark complete"}
                onClick={() => toggleTask(t.id, !done)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `2px solid ${done ? GREEN : "#9aa0a6"}`,
                  display: "grid",
                  placeItems: "center",
                  background: done ? GREEN : "#fff",
                  cursor: "pointer",
                  flex: "0 0 auto",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke={done ? "#fff" : "transparent"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>

              <div style={{ flex: 1, opacity: done ? 0.9 : 1 }}>
                <div style={{ fontWeight: 600, color: "#111" }}>
                  {order}. {t.title ?? t.id}
                </div>
                {(stats.lastMs ||
                  stats.bestMs ||
                  stats.avgMs ||
                  typeof stats.count === "number") && (
                  <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
                    Last: {msToClock(stats.lastMs)}
                    {stats.bestMs ? ` • Best: ${msToClock(stats.bestMs)}` : ""}
                    {stats.avgMs ? ` • Avg: ${msToClock(stats.avgMs)}` : ""}
                    {typeof stats.count === "number"
                      ? ` • Sessions ${stats.count}`
                      : ""}
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







