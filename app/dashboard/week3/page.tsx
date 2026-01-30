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
  done?: boolean;
};

const YELLOW = "#FFC20E";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

/* ----------------------------------
   MAIN
---------------------------------- */
export default function Week3Page() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [week2Approved, setWeek2Approved] = useState<boolean | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvedById, setApprovedById] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  /* ---------- AUTH ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ---------- WEEK 2 GUARD ---------- */
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid, "sections", "week2"), (snap) => {
      setWeek2Approved(snap.exists() && snap.data()?.approved === true);
    });
  }, [uid]);

  /* ---------- LOAD TASKS ---------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      const snap = await getDocs(
        query(collection(db, "modules", "week3", "tasks"), orderBy("order", "asc"))
      );

      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        done: false,
      }));

      if (alive) {
        setTasks(list);
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- HYDRATE DONE ---------- */
  useEffect(() => {
    if (!uid || !tasks.length) return;

    (async () => {
      const snap = await getDocs(collection(db, "users", uid, "progress"));
      const done: Record<string, boolean> = {};

      snap.forEach((d) => {
        const data = d.data() as any;
        if (data.week !== "week3" || !data.done) return;
        const id = d.id.split("__").pop();
        if (id) done[id] = true;
      });

      setTasks((prev) => prev.map((t) => ({ ...t, done: !!done[t.id] })));
    })();
  }, [uid, tasks.length]);

  /* ---------- LIVE APPROVAL BADGES ---------- */
  useEffect(() => {
    if (!uid) return;

    const unsubs = tasks.map((t) =>
      onSnapshot(
        doc(db, "users", uid, "progress", `modules__week3__tasks__${t.id}`),
        (snap) =>
          setApprovedById((p) => ({ ...p, [t.id]: !!snap.data()?.approved }))
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [uid, tasks]);

  /* ---------- TOGGLE DONE ---------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;

    setTasks((p) => p.map((t) => (t.id === id ? { ...t, done: next } : t)));

    const storeId = await getStoreId();
    await setDoc(
      doc(db, "users", uid, "progress", `modules__week3__tasks__${id}`),
      {
        week: "week3",
        done: next,
        storeId: storeId || "",
        traineeId: uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /* ---------- AUTO COMPLETE ---------- */
  useEffect(() => {
    if (!uid) return;
    if (tasks.length && tasks.every((t) => t.done)) {
      setDoc(
        doc(db, "users", uid, "sections", "week3"),
        { completed: true, completedAt: serverTimestamp() },
        { merge: true }
      );
    }
  }, [uid, tasks]);

  if (authLoading || loading || week2Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  if (!week2Approved) {
    return (
      <main style={{ padding: 24 }}>
        <Link href="/dashboard">← Back</Link>
        <p style={{ marginTop: 16, fontWeight: 700 }}>
          Week 3 is locked. Week 2 must be approved.
        </p>
      </main>
    );
  }

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  /* ---------- UI ---------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <Link href="/dashboard">← Back to Dashboard</Link>

      <h2 style={{ marginTop: 12 }}>Week 3</h2>
      <div style={{ fontSize: 14, marginBottom: 6 }}>
        {doneCount}/{tasks.length} completed ({pct}%)
      </div>

      <div style={{ height: 12, background: "#ddd", borderRadius: 999 }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: YELLOW,
            borderRadius: 999,
          }}
        />
      </div>

      <ul style={{ listStyle: "none", padding: 0, marginTop: 18 }}>
        {tasks.map((t, i) => (
          <li
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 14,
              borderRadius: 12,
              background: "#fff",
              border: `1px solid ${t.done ? "#d6ead8" : GRAY}`,
              marginBottom: 10,
            }}
          >
            <button
              onClick={() => toggleTask(t.id, !t.done)}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: t.done ? `2px solid ${GREEN}` : `2px solid ${GRAY}`,
                background: t.done ? GREEN : "#fff",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {t.done ? "✓" : ""}
            </button>

            <div style={{ fontWeight: 600 }}>
              {(t.order ?? i + 1)}. {t.title}
              {approvedById[t.id] && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 12,
                    background: "#e6f4ea",
                    color: GREEN,
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  Approved ✓
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}