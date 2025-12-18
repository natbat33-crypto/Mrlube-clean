"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
};

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ----------------------------------
   MAIN
---------------------------------- */
export default function Week3Page() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 🔒 AUTHORITY — Week 2 must be approved
  const [week2Approved, setWeek2Approved] = useState<boolean | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvedById, setApprovedById] = useState<Record<string, boolean>>({});
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
     🔒 AUTHORITY GUARD (LIVE)
     users/{uid}/sections/week2.approved
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid, "sections", "week2");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const approved = snap.exists() && snap.data()?.approved === true;
        setWeek2Approved(approved);
      },
      () => setWeek2Approved(false)
    );

    return unsub;
  }, [uid]);

  /* ----------------------------------
     LOAD WEEK 3 TASK DEFINITIONS
  ---------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const col = collection(db, "modules", "week3", "tasks");
        const q = query(col, orderBy("order", "asc"));
        const snap = await getDocs(q);

        const list: Task[] = snap.docs
          .map((d) => {
            const { done, ...rest } = d.data() as any;
            return { id: d.id, ...(rest as Partial<Task>), done: false };
          })
          .sort((a, b) => num(a.order ?? a.sort_order) - num(b.order ?? b.sort_order));

        if (alive) {
          setTasks(list);
          setErr(null);
        }
      } catch (e: any) {
        if (alive) {
          setErr(e?.message ?? String(e));
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

  /* ----------------------------------
     HYDRATE DONE FLAGS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || !tasks.length) return;

    (async () => {
      try {
        const progCol = collection(db, "users", uid, "progress");
        const snap = await getDocs(progCol);

        const doneById: Record<string, boolean> = {};

        snap.forEach((d) => {
          const data = d.data() as any;
          if (data.week !== "week3" || !data.done) return;

          const m = d.id.match(/^modules__week3__tasks__(.+)$/);
          if (m) doneById[m[1]] = true;
        });

        setTasks((prev) =>
          prev.map((t) => (doneById[t.id] ? { ...t, done: true } : t))
        );
      } catch {}
    })();
  }, [uid, tasks.length]);

  /* ----------------------------------
     LIVE TASK APPROVAL BADGES
  ---------------------------------- */
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

    return () => unsubs.forEach((u) => u());
  }, [uid, tasks]);

  const doneCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks]);
  const pct = useMemo(
    () => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0),
    [doneCount, tasks.length]
  );

  /* ----------------------------------
     TOGGLE TASK DONE
  ---------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;

    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: next } : t)));

    try {
      try {
        await setDoc(
          doc(db, "modules", "week3", "tasks", id),
          { done: next, completedAt: next ? serverTimestamp() : deleteField() },
          { merge: true }
        );
      } catch {}

      const key = `modules__week3__tasks__${id}`;
      const storeId = await getStoreId();

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          week: "week3",
          done: next,
          storeId: storeId || "",
          traineeId: uid,
          createdBy: uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !next } : t)));
    }
  }

  /* ----------------------------------
     ✅ AUTO-CREATE sections/week3
     (NO approved written here)
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const allDone = tasks.length > 0 && tasks.every((t) => t.done === true);
    if (!allDone) return;

    setDoc(
      doc(db, "users", uid, "sections", "week3"),
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
  if (authLoading || loading || week2Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ----------------------------------
     LOCKED VIEW
  ---------------------------------- */
  if (week2Approved === false) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/dashboard">← Back to Dashboard</Link>
        <p style={{ marginTop: 16, fontWeight: 700 }}>
          Week 3 is locked. Week 2 must be approved.
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

      <h2>Week 3 — Tasks</h2>

      <div>{doneCount}/{tasks.length} completed ({pct}%)</div>

      <ul style={{ listStyle: "none", padding: 0 }}>
        {tasks.map((t, i) => (
          <li key={t.id} style={{ padding: 12, border: "1px solid #ddd" }}>
            <button onClick={() => toggleTask(t.id, !t.done)}>
              {t.done ? "✓" : "○"}
            </button>{" "}
            {(t.order ?? i + 1)}. {t.title}
            {approvedById[t.id] && <span> (Approved)</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
