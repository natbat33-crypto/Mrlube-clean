'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  getDocs,
  getDoc,
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
  done?: boolean;
};

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

// Temporary store fallback
const currentStoreId = "STORE_001";

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
     Load static task definitions
     (never trust shared `done`)
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
              const { done, ...rest } = d.data() as Partial<Task>;
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
     Load user's saved progress (per-user)
  ---------------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const col = collection(db, "users", uid, "progress");

    const unsub = onSnapshot(col, (snap) => {
      const map: Record<string, boolean> = {};

      snap.forEach((d) => {
        const data = d.data() as any;
        if (data.week === "day-1") {
          const parts = d.id.split("__");
          const taskId = parts[parts.length - 1];
          map[taskId] = !!data.done;
        }
      });

      setTasks((prev) =>
        prev.map((t) => ({
          ...t,
          done: map[t.id] ?? false,
        }))
      );
    });

    return unsub;
  }, [uid]);

  /* ---------------------------------------
     Toggle task complete (per-user only)
  ---------------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;

    const t = tasks.find((x) => x.id === id);

    setTasks((prev) =>
      prev.map((x) => (x.id === id ? { ...x, done: next } : x))
    );

    try {
      const path = `days/day-1/tasks/${id}`;
      const key = path.replace(/\//g, "__");

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          path,
          week: "day-1",
          title: t?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
          storeId: currentStoreId,
          traineeId: uid,
          createdBy: uid,
        },
        { merge: true }
      );
    } catch {
      setTasks((prev) =>
        prev.map((x) => (x.id === id ? { ...x, done: !next } : x))
      );
      alert("Failed to save. Try again.");
    }
  }

  /* ---------------------------------------
     🔑 SYNC PROGRESS FOR DASHBOARD (FIX)
     This is what makes 0/6, 1/6, etc work
  ---------------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const total = tasks.length;
    const completed = tasks.filter((t) => t.done).length;

    setDoc(
      doc(db, "users", uid, "sections", "day1"),
      {
        completedCount: completed,
        totalCount: total,
        completed: total > 0 && completed === total,
        updatedAt: serverTimestamp(),
        // NEVER write approved here
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
    () => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0),
    [doneCount, tasks.length]
  );

  if (authLoading || loading)
    return <main style={{ padding: 24 }}>Loading…</main>;

  /* ---------------------------------------
     UI
  ---------------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/dashboard">← Back to Dashboard</Link>
      </div>

      {day1Approved && <strong>Day 1 Approved ✓</strong>}

      <h2>{pageTitle}</h2>

      <div>{doneCount}/{tasks.length} completed ({pct}%)</div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {tasks.map((t, idx) => {
          const done = !!t.done;
          return (
            <li key={t.id}>
              <button onClick={() => toggleTask(t.id, !done)}>
                {done ? "✓" : "○"}
              </button>{" "}
              {num(t.order ?? t.sort_order ?? idx + 1)}. {t.title}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
