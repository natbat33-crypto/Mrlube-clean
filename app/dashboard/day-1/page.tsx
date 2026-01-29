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

  // SAFETY: prevent double hydration
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
     Load Day 1 task definitions
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
              const { done, ...rest } = data;
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
     LOAD DONE FLAGS (user progress)
  ---------------------------------------- */
  useEffect(() => {
    if (!uid || tasks.length === 0 || hydrated) return;

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
          doneMap[parts[parts.length - 1]] = true;
        });

        setTasks((prev) =>
          prev.map((t) => ({ ...t, done: !!doneMap[t.id] }))
        );

        setHydrated(true);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [uid, tasks.length, hydrated]);

  /* ---------------------------------------
     Toggle task
  ---------------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;

    const t = tasks.find((x) => x.id === id);

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
          title: t?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      setTasks((prev) =>
        prev.map((x) => (x.id === id ? { ...x, done: !next } : x))
      );
    }
  }

  /* ======================================================
     ✅ ADDITIVE FIX — DASHBOARD SYNC (DO NOT REMOVE)
     ====================================================== */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;

    (async () => {
      try {
        const storeId = await getStoreId();
        if (!storeId) return;

        const doneIds = tasks.filter(t => t.done).map(t => t.id);

        await setDoc(
          doc(db, "stores", String(storeId), "trainees", uid, "progress", "day-1"),
          {
            doneIds,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (e) {
        console.error("[Day1 sync]", e);
      }
    })();
  }, [uid, tasks]);
  /* ================= END FIX ================= */

  /* ---------------------------------------
     Section completion
  ---------------------------------------- */
  useEffect(() => {
    if (!uid) return;
    if (!tasks.length || !tasks.every(t => t.done)) return;

    setDoc(
      doc(db, "users", uid, "sections", "day1"),
      { completed: true, completedAt: serverTimestamp() },
      { merge: true }
    );
  }, [uid, tasks]);

  const doneCount = tasks.filter(t => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  if (authLoading || loading) return <main style={{ padding: 24 }}>Loading…</main>;

  /* ---------------------------------------
     UI (UNCHANGED)
  ---------------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <Link href="/dashboard">← Back to Dashboard</Link>

      <h2>{pageTitle}</h2>
      <div>{doneCount}/{tasks.length} ({pct}%)</div>

      <ul>
        {tasks.map((t, i) => (
          <li key={t.id}>
            <button onClick={() => toggleTask(t.id, !t.done)}>
              {t.done ? "✓" : "○"}
            </button>
            {i + 1}. {t.title}
          </li>
        ))}
      </ul>
    </main>
  );
}

