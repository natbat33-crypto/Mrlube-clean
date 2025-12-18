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

/* ----------------------------------
   TYPES
---------------------------------- */
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
  if (ms == null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Week4Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 🔒 AUTHORITY — Week 3 must be approved
  const [week3Approved, setWeek3Approved] = useState<boolean | null>(null);

  const [baseTasks, setBaseTasks] = useState<Task[]>([]);
  const [statsById, setStatsById] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
     🔒 AUTHORITY GUARD — Week 3 REQUIRED
     users/{uid}/sections/week3.approved
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid, "sections", "week3");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const ok = snap.exists() && snap.data()?.approved === true;
        setWeek3Approved(ok);
      },
      () => setWeek3Approved(false)
    );

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
        const list: Task[] = snap.docs
          .map((d) => {
            const { done, ...rest } = d.data() as any;
            return { id: d.id, ...(rest as Partial<Task>) };
          })
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order) -
              num(b.order ?? b.sort_order)
          );
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
     LIVE PER-USER STATS
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
        done: s.done,
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
     TOGGLE TASK
  ---------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;

    setStatsById((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), done: next },
    }));

    try {
      const key = `modules__week4__tasks__${id}`;
      const storeId = await getStoreId();

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
     ✅ AUTO-CREATE sections/week4
     (NO approved written)
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

  /* ----------------------------------
     BLOCK UNTIL AUTH KNOWN
  ---------------------------------- */
  if (authLoading || loading || week3Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ----------------------------------
     LOCKED VIEW
  ---------------------------------- */
  if (week3Approved === false) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/dashboard">← Back to Dashboard</Link>
        <p style={{ marginTop: 16, fontWeight: 700 }}>
          Week 4 is locked. Week 3 must be approved.
        </p>
      </main>
    );
  }

  /* ----------------------------------
     NORMAL UI
  ---------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <Link href="/dashboard">← Back to Dashboard</Link>
      <h2>Week 4 — Timed Tasks</h2>
      <div>{doneCount}/{tasks.length} completed ({pct}%)</div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {tasks.map((t) => (
          <li key={t.id} style={{ padding: 12, border: "1px solid #ddd" }}>
            <button onClick={() => toggleTask(t.id, !t.done)}>
              {t.done ? "✓" : "○"}
            </button>{" "}
            {t.title}
          </li>
        ))}
      </ul>
    </main>
  );
}







