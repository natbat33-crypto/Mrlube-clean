'use client';
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { getStoreId } from "@/lib/getStoreId";
import {
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
  deleteField,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
  done?: boolean;
};

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function Day1Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [pageTitle, setPageTitle] = useState("Day 1 Orientation");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [day1Approved, setDay1Approved] = useState(false);

  // ✅ SAFETY FIX: prevent double-hydration / stale flash
  const [hydrated, setHydrated] = useState(false);

  /* ---------------------------------------
     AUTH
  ---------------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ---------------------------------------
     Listen for approval
  ---------------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setDay1Approved(snap.data()?.approved === true);
    });

    return unsub;
  }, [uid]);

  /* ---------------------------------------
     Load static task definitions (Day 1 own data)
     IMPORTANT: ignore any shared `done`
  ---------------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const dayDoc = await getDoc(doc(db, "days", "day-1"));
        if (alive && dayDoc.exists()) {
          const dt = dayDoc.data() as any;
          setPageTitle(dt.title || dt.name || "Day 1 Orientation");
        }

        const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
        const list: Task[] =
          snap.docs
            .map((d) => {
              const data = d.data() as Partial<Task>;
              const { done, ...rest } = data; // ignore any shared done
              return { id: d.id, ...rest, done: false };
            })
            .sort(
              (a, b) =>
                num(a.order ?? a.sort_order ?? 0) -
                num(b.order ?? b.sort_order ?? 0)
            );

        if (alive) {
          setTasks(list);
          setErr(null);
        }
      } catch (e: any) {
        if (alive) {
          setErr(e.message ?? String(e));
          setTasks([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------------------------------------
     ✅ LOAD DONE FLAGS (Week 1 pattern)
     SAFETY FIX: run ONCE per mount to avoid stale flashes
  ---------------------------------------- */
  useEffect(() => {
    if (!uid) return;
    if (tasks.length === 0) return;
    if (hydrated) return; // ✅ SAFETY GUARD

    let stopped = false;

    (async () => {
      try {
        const col = collection(db, "users", uid, "progress");
        const q = query(col, where("week", "==", "day-1"));
        const snap = await getDocs(q);

        const doneMap: Record<string, boolean> = {};

        snap.forEach((d) => {
          const data = d.data() as any;
          if (!data.done) return;

          const parts = d.id.split("__");
          const taskId = parts[parts.length - 1];
          doneMap[taskId] = true;
        });

        if (stopped) return;

        setTasks((prev) =>
          prev.map((t) => ({
            ...t,
            done: !!doneMap[t.id],
          }))
        );

        // ✅ mark hydration complete so we never re-apply unexpectedly
        setHydrated(true);
      } catch (e: any) {
        console.error("[Day1] load done flags error:", e);
        setErr(e?.message ?? String(e));
      }
    })();

    return () => {
      stopped = true;
    };
  }, [uid, tasks.length, hydrated]);

  /* ---------------------------------------
     Toggle task complete (per-user, Day 1 keys)
  ---------------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) {
      alert("Please log in to save your progress.");
      return;
    }

    const t = tasks.find((x) => x.id === id);

    // Optimistic UI
    setTasks((prev) =>
      prev.map((x) => (x.id === id ? { ...x, done: next } : x))
    );

    try {
      const key = `days__day-1__tasks__${id}`; // explicit Week1-style key
      const storeId = await getStoreId();

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          storeId: storeId || "",
          traineeId: uid,
          createdBy: uid,
          week: "day-1",
          title: t?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e: any) {
      console.error("[Day1] toggle error:", e);
      // rollback
      setTasks((prev) =>
        prev.map((x) => (x.id === id ? { ...x, done: !next } : x))
      );
      alert(`Save failed — ${e?.message ?? String(e)}`);
    }
  }

  /* ---------------------------------------
     ✅ AUTO-CREATE SECTION DOC (COMPLETE ONLY)
     Trainee NEVER writes approved
  ---------------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const allComplete =
      tasks.length > 0 && tasks.every((t) => t.done === true);
    if (!allComplete) return;

    setDoc(
      doc(db, "users", uid, "sections", "day1"),
      {
        completed: true,
        completedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [uid, tasks]);

  /* ---------------------------------------
     Derived values
  ---------------------------------------- */
  const doneCount = useMemo(
    () => tasks.filter((t) => t.done).length,
    [tasks]
  );

  const pct = useMemo(
    () =>
      tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
    [doneCount, tasks.length]
  );

  if (authLoading || loading)
    return <main style={{ padding: 24 }}>Loading…</main>;

  /* ---------------------------------------
     UI (UNCHANGED STYLING)
  ---------------------------------------- */
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
          ← Back to Dashboard
        </Link>
      </div>

      {day1Approved && (
        <div
          style={{
            background: "#e8f5e9",
            border: "1px solid #c8e6c9",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            color: "#256029",
            fontWeight: 600,
          }}
        >
          Day 1 Approved ✓
        </div>
      )}

      {!day1Approved && tasks.length > 0 && doneCount === tasks.length && (
        <div
          style={{
            background: "#fff3cd",
            border: "1px solid #ffeeba",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            color: "#856404",
            fontWeight: 600,
          }}
        >
          Day 1 completed — waiting for approval.
        </div>
      )}

      <h2 style={{ marginBottom: 6 }}>{pageTitle} — Tasks</h2>

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
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: YELLOW,
            transition: "width .2s ease",
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
          const order = num(t.order ?? t.sort_order ?? idx + 1);
          const done = !!t.done;

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
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>

              <div style={{ fontWeight: 600 }}>
                {order}. {t.title ?? t.id}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

