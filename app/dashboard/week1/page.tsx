"use client";
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

type Approvals = Record<string, boolean>;

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

/* ----------------------------------
   MAIN COMPONENT
---------------------------------- */
export default function Week1Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvedById, setApprovedById] = useState<Approvals>({});
  const [weekApproved, setWeekApproved] = useState<boolean>(false);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* ----------------------------------
     1. LISTEN FOR AUTH
  ---------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ----------------------------------
     2. LOAD TASKS
  ---------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const col = collection(db, "modules", "week1", "tasks");
        const q = query(col, orderBy("order", "asc"));
        const snap = await getDocs(q);

        const list: Task[] = snap.docs.map((d) => {
          const data = d.data() as Partial<Task>;
          return {
            id: d.id,
            title: data.title,
            order: data.order,
            sort_order: data.sort_order,
            required: data.required,
            done: false,
          };
        });

        if (alive) {
          setTasks(list);
          setErr(null);
        }
      } catch (e: any) {
        if (alive) {
          console.error("[Week1] fetch error:", e);
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
     3. LISTEN FOR WHOLE-WEEK APPROVAL
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;

    const ref = doc(db, "users", uid, "sections", "week1");
    const unsub = onSnapshot(ref, (snap) => {
      setWeekApproved(snap.data()?.approved === true);
    });

    return unsub;
  }, [uid]);

  /* ----------------------------------
     4. LISTEN FOR PER-TASK APPROVALS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;

    const unsubs = tasks.map((task: Task) => {
      const key = `modules__week1__tasks__${task.id}`;
      const ref = doc(db, "users", uid, "progress", key);

      return onSnapshot(ref, (snap) => {
        const approved = !!snap.data()?.approved;
        setApprovedById((prev) => ({
          ...prev,
          [task.id]: approved,
        }));
      });
    });

    return () => unsubs.forEach((u) => u && u());
  }, [uid, tasks]);

  /* ----------------------------------
     5. LOAD DONE FLAGS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;

    let stopped = false;

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
      } catch (e) {
        console.error("[Week1] load done flags error:", e);
      }
    })();

    return () => {
      stopped = true;
    };
  }, [uid, tasks.length]);

  /* ----------------------------------
     6. TOGGLE TASK DONE
  ---------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) {
      alert("Please log in.");
      return;
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: next } : t))
    );

    try {
      const key = `modules__week1__tasks__${id}`;
      const storeId = await getStoreId();
      const task = tasks.find((t) => t.id === id);

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          storeId: storeId || "",
          traineeId: uid,
          createdBy: uid,
          week: "week1",
          title: task?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("toggle error:", e);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !next } : t))
      );
      alert("Save failed — try again.");
    }
  }

  const doneCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks]);
  const pct = useMemo(() => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0), [doneCount, tasks.length]);

  if (authLoading || loading) {
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

      {!weekApproved && (
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
          A trainer or manager must approve Week 1 before you can move on.
        </div>
      )}

      <h2 style={{ marginBottom: 6 }}>Week 1 — Steps to a Perfect Service</h2>
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
            transition: "width 200ms",
          }}
        />
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {tasks.map((t: Task, index: number) => {
          const order = t.order ?? t.sort_order ?? index + 1;
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
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 600 }}>
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

/* ----------------------------------
   HELPERS
---------------------------------- */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}




