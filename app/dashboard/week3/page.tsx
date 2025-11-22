'use client';
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { getStoreId } from "@/lib/getStoreId";
import {
  collection,
  getDocs,
  orderBy,
  query,
  setDoc,
  doc,
  serverTimestamp,
  deleteField,
  onSnapshot,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
  required?: boolean;
  done?: boolean;
};

const YELLOW = "#FFC20E";
const NAVY   = "#0b3d91";
const GREEN  = "#2e7d32";
const GRAY   = "#e9e9ee";

export default function Week3Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvedById, setApprovedById] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ 1. Get logged-in user
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ✅ 2. Load Week 3 tasks (template only, ignore shared `done`)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const col = collection(db, "modules", "week3", "tasks");
        const q = query(col, orderBy("order", "asc"));
        const snap = await getDocs(q);
        const list: Task[] = snap.docs
          .map((d) => {
            const data = d.data() as any;
            // strip any shared `done` from template so it doesn't leak between trainees
            const { done, ...rest } = data || {};
            return { id: d.id, ...(rest as Partial<Task>) };
          })
          .sort((a, b) => num(a.order ?? a.sort_order) - num(b.order ?? b.sort_order));
        if (alive) {
          setTasks(list);
          setErr(null);
        }
      } catch (e: any) {
        console.error("[Week3] fetch error:", e);
        if (alive) {
          setErr(e?.message ?? String(e));
          setTasks([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // hydrate `done` from this trainee's progress docs
  useEffect(() => {
    if (!uid || !tasks.length) return;
    let alive = true;

    (async () => {
      try {
        const progCol = collection(db, "users", uid, "progress");
        const snap = await getDocs(progCol);

        const doneById: Record<string, boolean> = {};

        snap.forEach((d) => {
          const data = d.data() as any;
          if (!data?.done) return;
          if (data.week !== "week3") return;

          // key pattern: modules__week3__tasks__<taskId>
          const key = d.id;
          const m = key.match(/^modules__week3__tasks__(.+)$/);
          if (!m) return;
          const taskId = m[1];
          doneById[taskId] = true;
        });

        if (!alive) return;
        if (Object.keys(doneById).length === 0) return;

        setTasks((prev) =>
          prev.map((t) =>
            doneById[t.id] ? { ...t, done: true } : t
          )
        );
      } catch {
        // ignore — tasks will just start unchecked
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid, tasks.length]);

  // ✅ 3. Realtime approvals (supervisor badge)
  useEffect(() => {
    if (!uid || !tasks.length) return;
    const unsubs = tasks.map((t) => {
      const key = `modules__week3__tasks__${t.id}`;
      return onSnapshot(doc(db, "users", uid, "progress", key), (snap) => {
        const approved = !!snap.data()?.approved;
        setApprovedById((prev) =>
          prev[t.id] === approved ? prev : { ...prev, [t.id]: approved }
        );
      });
    });
    return () => unsubs.forEach((u) => u && u());
  }, [uid, tasks]);

  const doneCount = useMemo(() => tasks.filter(t => t.done).length, [tasks]);
  const pct = useMemo(
    () => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0),
    [doneCount, tasks.length]
  );

  // ✅ 4. Toggle task done
  async function toggleTask(id: string, next: boolean) {
    if (!uid) {
      alert("Please log in to save your progress.");
      return;
    }

    // optimistic update
    setTasks((prev) => prev.map(t => t.id === id ? { ...t, done: next } : t));

    try {
      // optional shared update (ignore if blocked)
      try {
        await setDoc(
          doc(db, "modules", "week3", "tasks", id),
          { done: next, completedAt: next ? serverTimestamp() : deleteField() },
          { merge: true }
        );
      } catch {}

      // authoritative per-user progress
      const key = `modules__week3__tasks__${id}`;
      const t = tasks.find(x => x.id === id);
      const storeId = await getStoreId();

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          storeId: storeId || "",
          traineeId: uid,
          createdBy: uid,
          week: "week3",
          title: t?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      // rollback on failure
      setTasks((prev) => prev.map(t => t.id === id ? { ...t, done: !next } : t));
      alert("Failed to save. Check Firestore rules and try again.");
    }
  }

  if (authLoading || loading) return <main style={{ padding: 24 }}>Loading…</main>;

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

      <h2 style={{ margin: "0 0 6px 0" }}>Week 3 — Tasks</h2>
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

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {tasks.map((t, idx) => {
          const order = t.order ?? t.sort_order ?? idx + 1;
          const done = !!t.done;
          const approved = !!approvedById[t.id];
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
                boxShadow: done ? "0 1px 2px rgba(0,0,0,0.04)" : "0 1px 2px rgba(0,0,0,0.03)",
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

              <div style={{ opacity: done ? 0.9 : 1, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600, color: "#111" }}>
                  {order}. {t.title ?? t.id}
                </div>
                {approved && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#e7f6ec",
                      border: "1px solid #c7e8d3",
                      color: "#1b5e20",
                      fontWeight: 600,
                    }}
                  >
                    Approved ✓
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

