'use client';
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
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
  const [hydrated, setHydrated] = useState(false);

  /* ---------- AUTH ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ---------- LISTEN FOR TRAINER APPROVAL ---------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid, "sections", "day1");
    return onSnapshot(ref, (snap) => {
      setDay1Approved(snap.exists() && snap.data()?.approved === true);
    });
  }, [uid]);

  /* ---------- LOAD TASKS ---------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const dayDoc = await getDoc(doc(db, "days", "day-1"));
        if (alive && dayDoc.exists()) {
          const d: any = dayDoc.data();
          setPageTitle(d.title || d.name || "Day 1 Orientation");
        }

        const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
        const list: Task[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any), done: false }))
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order ?? 0) -
              num(b.order ?? b.sort_order ?? 0)
          );

        if (alive) setTasks(list);
      } catch (e: any) {
        if (alive) setErr(e.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- LOAD SAVED PROGRESS ---------- */
  useEffect(() => {
    if (!uid || !tasks.length || hydrated) return;

    (async () => {
      const snap = await getDocs(
        query(
          collection(db, "users", uid, "progress"),
          where("week", "==", "day-1")
        )
      );

      const map: Record<string, boolean> = {};
      snap.forEach((d) => {
        if (!d.data()?.done) return;
        const parts = d.id.split("__");
        map[parts[parts.length - 1]] = true;
      });

      setTasks((prev) => prev.map((t) => ({ ...t, done: !!map[t.id] })));
      setHydrated(true);
    })();
  }, [uid, tasks.length, hydrated]);

  /* ---------- TOGGLE TASK (LOCKED IF APPROVED) ---------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid || day1Approved) return;

    setTasks((prev) =>
      prev.map((x) => (x.id === id ? { ...x, done: next } : x))
    );

    try {
      const key = `days__day-1__tasks__${id}`;
      const storeId = await getStoreId();

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          storeId: storeId || "",
          traineeId: uid,
          createdBy: uid,
          week: "day-1",
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      setTasks((prev) =>
        prev.map((x) => (x.id === id ? { ...x, done: !next } : x))
      );
    }
  }

  /* ---------- COMPLETE SECTION ---------- */
  useEffect(() => {
    if (!uid || !tasks.length) return;
    if (!tasks.every((t) => t.done)) return;

    setDoc(
      doc(db, "users", uid, "sections", "day1"),
      { completed: true, completedAt: serverTimestamp() },
      { merge: true }
    );
  }, [uid, tasks]);

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  if (authLoading || loading) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ---------- UI ---------- */
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
        }}
      >
        ← Back to Dashboard
      </Link>

      {day1Approved && (
        <div
          style={{
            marginTop: 16,
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 8,
            background: "#e7f6ec",
            border: "1px solid #c7e8d3",
            color: "#1b5e20",
            fontWeight: 600,
          }}
        >
          Day 1 approved ✓
        </div>
      )}

      <h2 style={{ marginBottom: 6 }}>
        {pageTitle} — Tasks
      </h2>

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
          }}
        />
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {tasks.map((t, idx) => (
          <li
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#fff",
              border: `1px solid ${t.done ? "#d6ead8" : GRAY}`,
              opacity: day1Approved ? 0.6 : 1,
            }}
          >
            <button
              onClick={() => toggleTask(t.id, !t.done)}
              disabled={day1Approved}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: `2px solid ${t.done ? GREEN : "#9aa0a6"}`,
                background: t.done ? GREEN : "#fff",
                cursor: day1Approved ? "not-allowed" : "pointer",
              }}
            />
            <div style={{ fontWeight: 600 }}>
              {idx + 1}. {t.title ?? t.id}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
