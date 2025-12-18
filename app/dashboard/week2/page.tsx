"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
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
  where,
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

/* ----------------------------------
   MAIN
---------------------------------- */
export default function Week2Page() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 🔒 AUTHORITY
  const [week1Approved, setWeek1Approved] = useState<boolean | null>(null);

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
     🔒 WEEK 1 AUTHORITY (LIVE)
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid, "sections", "week1");
    const unsub = onSnapshot(ref, (snap) => {
      const ok = snap.exists() && snap.data()?.approved === true;
      setWeek1Approved(ok);

      if (!ok) {
        router.replace("/dashboard");
      }
    });

    return unsub;
  }, [uid, router]);

  /* ----------------------------------
     LOAD TASK DEFINITIONS
  ---------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const col = collection(db, "modules", "week2", "tasks");
        const q = query(col, orderBy("order", "asc"));
        const snap = await getDocs(q);

        const list: Task[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Partial<Task>),
        }));

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
     LOAD USER PROGRESS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;

    (async () => {
      try {
        const col = collection(db, "users", uid, "progress");
        const q = query(col, where("week", "==", "week2"));
        const snap = await getDocs(q);

        const doneMap: Record<string, boolean> = {};
        snap.forEach((d) => {
          const data = d.data() as any;
          if (!data.done) return;
          const parts = d.id.split("__");
          doneMap[parts[parts.length - 1]] = true;
        });

        setTasks((prev) =>
          prev.map((t) => ({ ...t, done: !!doneMap[t.id] }))
        );
      } catch {}
    })();
  }, [uid, tasks.length]);

  /* ----------------------------------
     ✅ AUTO-CREATE sections/week2
     (trainee never writes approved)
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const allDone =
      tasks.length > 0 && tasks.every((t) => t.done === true);

    if (!allDone) return;

    setDoc(
      doc(db, "users", uid, "sections", "week2"),
      {
        completed: true,
        completedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [uid, tasks]);

  /* ----------------------------------
     BLOCK UNTIL AUTH RESOLVED
  ---------------------------------- */
  if (authLoading || loading || week1Approved === null) {
    return <main style={{ padding: 24 }}>Checking access…</main>;
  }

  if (week1Approved === false) {
    return <main style={{ padding: 24 }}>Access denied.</main>;
  }

  /* ----------------------------------
     UI
  ---------------------------------- */
  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

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

      <h2>Week 2</h2>

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
            height: "100%",
            width: `${pct}%`,
            background: YELLOW,
          }}
        />
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {tasks.map((t, i) => (
          <li
            key={t.id}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "#fff",
              border: `1px solid ${t.done ? "#d6ead8" : GRAY}`,
            }}
          >
            <strong>
              {(t.order ?? t.sort_order ?? i + 1)}. {t.title}
            </strong>
          </li>
        ))}
      </ul>
    </main>
  );
}




