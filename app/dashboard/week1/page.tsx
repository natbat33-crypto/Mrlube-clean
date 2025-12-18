"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  getDocs,
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
export default function Week1Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 🔒 AUTHORITY
  const [day1Approved, setDay1Approved] = useState<boolean | null>(null);

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
     🔒 DAY 1 AUTHORITY (LIVE)
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setDay1Approved(snap.exists() && snap.data()?.approved === true);
    });

    return unsub;
  }, [uid]);

  /* ----------------------------------
     LOAD TASK DEFINITIONS
  ---------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const col = collection(db, "modules", "week1", "tasks");
        const snap = await getDocs(query(col));

        const list: Task[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Partial<Task>) }))
          .sort((a, b) => {
            const ao = a.order ?? a.sort_order ?? 9999;
            const bo = b.order ?? b.sort_order ?? 9999;
            return ao - bo;
          });

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
        const q = query(col, where("week", "==", "week1"));
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
     ✅ AUTO-CREATE SECTION DOC (FIX)
     Trainee NEVER writes approved
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const allComplete =
      tasks.length > 0 && tasks.every((t) => t.done === true);

    if (!allComplete) return;

    setDoc(
      doc(db, "users", uid, "sections", "week1"),
      {
        completed: true,
        completedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }, [uid, tasks]);

  /* ----------------------------------
     DERIVED
  ---------------------------------- */
  const locked = day1Approved === false;

  const doneCount = useMemo(
    () => tasks.filter((t) => t.done).length,
    [tasks]
  );

  const pct = useMemo(
    () => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0),
    [doneCount, tasks.length]
  );

  if (authLoading || loading || day1Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ----------------------------------
     UI
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
            color: "#5f6368",
            fontWeight: 600,
          }}
        >
          Complete and get Day 1 approved to unlock Week 1.
        </div>
      )}

      <h2 style={{ opacity: locked ? 0.6 : 1 }}>
        Week 1 — Steps to a Perfect Service
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

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {tasks.map((t, i) => (
          <li
            key={t.id}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: locked ? "#f5f5f5" : "#fff",
              border: `1px solid ${t.done ? "#d6ead8" : GRAY}`,
              opacity: locked ? 0.6 : 1,
              pointerEvents: locked ? "none" : "auto",
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




