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

  /* ------------ AUTH LISTENER ------------ */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setSupervisorUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ------------ SYNC STORE ID ------------ */
  useEffect(() => {
    if (ctxStoreId) setStoreId(ctxStoreId);
  }, [ctxStoreId]);

  /* ------------ DEFAULT SELECTED TRAINEE ------------ */
  useEffect(() => {
    if (asParam) {
      setSelectedTraineeId(asParam);
      return;
    }
    if (!selectedTraineeId && trainees.length > 0) {
      setSelectedTraineeId(trainees[0].traineeId);
    }
  }, [asParam, trainees, selectedTraineeId]);

  /* ------------ LOAD TASK DEFINITIONS ------------ */
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

  /* ------------ LISTEN FOR PROGRESS ------------ */
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

  /* ------------ LISTEN FOR SECTION APPROVAL ------------ */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const ref = doc(db, "users", selectedTraineeId, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setSectionApproved(snap.data()?.approved === true);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* ------------ AUTO WRITE SECTION APPROVAL ------------ */
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
    );
  }, [selectedTraineeId, tasks, progressById]);

  /* ------------ APPROVE TOGGLE ------------ */
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
      alert("Failed to save approval.");
    }
  }

  /* ------------ COUNTS ------------ */
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

  const pct = useMemo(
    () =>
      tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
    [doneCount, tasks.length]
  );

  if (authLoading || loadingTasks) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ----------------------------------
        UI (FIXED ONLY)
  ---------------------------------- */
  return (
    <main className="p-6 max-w-3xl mx-auto">
      {/* BACK BUTTON */}
      <div className="mb-4">
        <Link
          href="/supervisor"
          className="inline-flex items-center gap-2 bg-white border border-gray-300 rounded-full px-4 py-2 font-semibold text-[var(--navy)]"
        >
          ← Back to Trainer Dashboard
        </Link>
      </div>

      {/* TRAINEE SELECTOR */}
      {storeId && trainees.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm mb-1 text-gray-600">
            Reviewing trainee:
          </label>

          <select
            value={selectedTraineeId ?? ""}
            onChange={(e) => setSelectedTraineeId(e.target.value || null)}
            className="min-w-[260px] px-3 py-2 rounded-lg border border-gray-300"
          >
            <option value="" disabled>
              Select trainee…
            </option>

            {trainees.map((t) => (
              <option key={t.id} value={t.traineeId}>
                {t.email || t.traineeEmail || t.userEmail || t.traineeId}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* HEADER */}
      <h2 className="text-xl font-bold mb-1">Day 1 — Orientation Review</h2>
      <div className="text-sm mb-2">
        {doneCount}/{tasks.length} completed ({pct}%) ·{" "}
        {approvedCount}/{tasks.length} approved
      </div>

      <div className="h-3 bg-gray-300 rounded-full overflow-hidden mb-4">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: YELLOW }}
        ></div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {!selectedTraineeId && (
        <p className="text-sm text-gray-600">
          Select a trainee to review their Day 1 progress.
        </p>
      )}

      {/* TASK LIST (UI FIXED) */}
      {selectedTraineeId && (
        <ul className="flex flex-col gap-3">
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
                  className="relative bg-white rounded-xl p-4 border shadow-sm"
                  style={{
                    borderColor: done ? "#d6ead8" : GRAY,
                  }}
                >
                  {/* LEFT STRIPE */}
                  <span
                    className="absolute left-0 top-0 bottom-0 rounded-l-xl"
                    style={{
                      width: 5,
                      background: done ? GREEN : "transparent",
                    }}
                  ></span>

                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="font-semibold text-base">
                      {order}. {t.title ?? t.id}
                    </div>

                    {/* APPROVE TOGGLE */}
                    <button
                      onClick={() => toggleApproved(t.id, !approved)}
                      disabled={!done}
                      className="grid place-items-center w-6 h-6 rounded-full border"
                      style={{
                        borderColor: approved
                          ? GREEN
                          : done
                          ? "#9aa0a6"
                          : "#ccc",
                        background: approved ? GREEN : "#fff",
                        opacity: done ? 1 : 0.5,
                        cursor: done ? "pointer" : "not-allowed",
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        stroke={approved ? "#fff" : "transparent"}
                        strokeWidth="3"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    </button>
                  </div>

                  {/* BADGES */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{
                        background: done ? "#e7f6ec" : "#f3f4f6",
                        border: `1px solid ${
                          done ? "#c7e8d3" : "rgba(148,163,184,0.5)"
                        }`,
                        color: done ? "#1b5e20" : "#4b5563",
                      }}
                    >
                      {done ? "Completed" : "Not completed"}
                    </span>

                    {approved && (
                      <span
                        className="text-xs px-3 py-1 rounded-full font-semibold"
                        style={{
                          background: "#e7f6ec",
                          border: "1px solid #c7e8d3",
                          color: "#1b5e20",
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
      )}
    </main>
  );
}

