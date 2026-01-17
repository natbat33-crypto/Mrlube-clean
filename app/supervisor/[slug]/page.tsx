"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { db, auth } from "@/lib/firebase";
import { useStoreCtx } from "@/app/providers/StoreProvider";
import { useSupervisorTrainees } from "@/lib/useSupervisorTrainees";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

/* ----------------------------------
   TYPES & CONSTANTS
---------------------------------- */
type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
};

type Progress = {
  done: boolean;
  approved: boolean;
};

type ProgressById = Record<string, Progress>;

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

/* Helper to normalize order */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ----------------------------------
   MAIN COMPONENT
---------------------------------- */
export default function Day1SupervisorPage() {
  const [supervisorUid, setSupervisorUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [progressById, setProgressById] = useState<ProgressById>({});
  const [sectionApproved, setSectionApproved] = useState(false);

  const [loadingTasks, setLoadingTasks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { storeId: ctxStoreId } = useStoreCtx();
  const searchParams = useSearchParams();
  const asParam = searchParams.get("as");

  const [storeId, setStoreId] = useState<string | null>(ctxStoreId ?? null);
  const trainees = useSupervisorTrainees(storeId);

  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(
    asParam
  );

  /* ----------------------------------
     1. AUTH LISTENER (supervisor)
  ---------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setSupervisorUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ----------------------------------
     2. SYNC storeId
  ---------------------------------- */
  useEffect(() => {
    if (ctxStoreId) setStoreId(ctxStoreId);
  }, [ctxStoreId]);

  /* ----------------------------------
     3. DEFAULT selected trainee
  ---------------------------------- */
  useEffect(() => {
    if (asParam) {
      setSelectedTraineeId(asParam);
      return;
    }
    if (!selectedTraineeId && trainees.length > 0) {
      setSelectedTraineeId(trainees[0].traineeId);
    }
  }, [asParam, trainees, selectedTraineeId]);

  /* ----------------------------------
     4. LOAD day-1 TASK DEFINITIONS
  ---------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingTasks(true);
        const col = collection(db, "days", "day-1", "tasks");
        const snap = await getDocs(col);

        const list: Task[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Partial<Task>) }))
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order ?? 0) -
              num(b.order ?? b.sort_order ?? 0)
          );

        if (!alive) return;
        setTasks(list);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        console.error("[Day1 supervisor] load tasks error:", e);
        setError(e?.message ?? String(e));
        setTasks([]);
      } finally {
        if (alive) setLoadingTasks(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ----------------------------------
     5. LISTEN FOR TRAINEE PROGRESS
  ---------------------------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const col = collection(db, "users", selectedTraineeId, "progress");
    const q = query(col, where("week", "==", "day-1"));

    const unsub = onSnapshot(q, (snap) => {
      const map: ProgressById = {};

      snap.forEach((d) => {
        const data = d.data() as any;

        const parts = d.id.split("__");
        const taskId = parts[parts.length - 1];

        map[taskId] = {
          done: !!data.done,
          approved: !!data.approved,
        };
      });

      setProgressById(map);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* ----------------------------------
     6. LISTEN FOR /sections/day1
  ---------------------------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const ref = doc(db, "users", selectedTraineeId, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setSectionApproved(snap.data()?.approved === true);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* ----------------------------------
     7. AUTO WRITE SECTION APPROVAL
  ---------------------------------- */
  useEffect(() => {
    if (!selectedTraineeId || tasks.length === 0) return;

    const allApproved =
      tasks.length > 0 &&
      tasks.every((t) => progressById[t.id]?.approved === true);

    setDoc(
      doc(db, "users", selectedTraineeId, "sections", "day1"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
    ).catch((e) =>
      console.error("[Day1 supervisor] section approval write error:", e)
    );
  }, [selectedTraineeId, tasks, progressById]);

  /* ----------------------------------
     8. APPROVE TOGGLE
  ---------------------------------- */
  async function toggleApproved(taskId: string, next: boolean) {
    if (!selectedTraineeId) {
      alert("Select a trainee first.");
      return;
    }

    try {
      const key = `days__day-1__tasks__${taskId}`;

      await setDoc(
        doc(db, "users", selectedTraineeId, "progress", key),
        {
          approved: next,
          approvedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("[Day1 supervisor] toggle approved error:", e);
      alert("Failed to save approval. Try again.");
    }
  }

  /* ----------------------------------
     DERIVED COUNTS
  ---------------------------------- */
  const doneCount = useMemo(
    () =>
      tasks.filter((t) => progressById[t.id]?.done === true).length,
    [tasks, progressById]
  );

  const approvedCount = useMemo(
    () =>
      tasks.filter((t) => progressById[t.id]?.approved === true).length,
    [tasks, progressById]
  );

  // Match Week 1 logic: percent of tasks approved
  const pct = useMemo(
    () =>
      tasks.length ? Math.round((approvedCount / tasks.length) * 100) : 0,
    [approvedCount, tasks.length]
  );

  const waitingCount = useMemo(
    () => (tasks.length ? tasks.length - approvedCount : 0),
    [tasks.length, approvedCount]
  );

  if (authLoading || loadingTasks) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ----------------------------------
     UI
  ---------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* Back (MATCH WEEK 1 TEXT) */}
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/supervisor"
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

      {/* HEADER + SMALL BAR ON RIGHT (MIRROR WEEK 1) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
        }}
      >
        {/* LEFT: title + counts */}
        <div>
          <h2 style={{ marginBottom: 4 }}>Day 1 — Orientation Review</h2>
          <div style={{ fontSize: 14, color: "#4b5563" }}>
            {waitingCount} waiting • {approvedCount} approved • {pct}% approved
          </div>
        </div>

        {/* RIGHT: "Approved" + tiny yellow bar + % */}
        <div
          style={{
            textAlign: "right",
            minWidth: 80,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            Approved
          </div>

          <div
            style={{
              height: 4,
              width: 40,
              background: "#e5e7eb",
              borderRadius: 999,
              overflow: "hidden",
              marginLeft: "auto",
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

          <div
            style={{
              fontSize: 12,
              color: "#6b7280",
              marginTop: 4,
            }}
          >
            {pct}%
          </div>
        </div>
      </div>

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {!selectedTraineeId && (
        <p style={{ fontSize: 14, color: "#666" }}>
          Select a trainee to review their Day 1 progress.
        </p>
      )}

      {/* TASK LIST – UI MATCHES WEEK 1 ROWS */}
      {selectedTraineeId && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {tasks
            .filter((t) => progressById[t.id]?.done === true)
            .map((t, idx) => {
              const order = num(t.order ?? t.sort_order ?? idx + 1);
              const prog = progressById[t.id] || {
                done: false,
                approved: false,
              };
              const done = prog.done;
              const approved = prog.approved;

              return (
                <li
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "#fff",
                    border: `1px solid ${GRAY}`,
                  }}
                >
                  {/* Text on the left */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 14,
                      }}
                    >
                      {order}. {t.title ?? t.id}
                    </div>

                    <span
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                      }}
                    >
                      {done ? "Completed" : "Not completed"}
                    </span>
                  </div>

                  {/* Approve / Unapprove button on the right */}
                  <button
                    onClick={() => toggleApproved(t.id, !approved)}
                    disabled={!done}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      border: `1px solid ${
                        approved ? "#10b981" : "#d1d5db"
                      }`,
                      backgroundColor: approved ? "#10b981" : "#f9fafb",
                      color: approved ? "#ffffff" : "#374151",
                      cursor: done ? "pointer" : "not-allowed",
                      opacity: done ? 1 : 0.5,
                    }}
                  >
                    {approved ? "Unapprove" : "Approve"}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </main>
  );
}
