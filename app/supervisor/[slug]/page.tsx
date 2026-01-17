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
const GRAY_BORDER = "#e5e7eb";

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
    () => tasks.filter((t) => progressById[t.id]?.done === true).length,
    [tasks, progressById]
  );

  const approvedCount = useMemo(
    () => tasks.filter((t) => progressById[t.id]?.approved === true).length,
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
        FIXED UI (MATCHES WEEK 1)
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

      {/* CLEAN WEEK-1 HEADER */}
      <h2 className="text-xl font-bold mb-2">Day 1 — Orientation Review</h2>

      <div className="flex justify-between items-center text-sm text-gray-600 mb-4">
        <span>
          {tasks.length - approvedCount} waiting • {approvedCount} approved •{" "}
          {pct}%
        </span>

        <span className="font-bold">{pct}%</span>
      </div>

      {/* CLEAN GREY PROGRESS BAR */}
      <div className="h-2 bg-gray-300 rounded-full overflow-hidden mb-6">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: YELLOW }}
        />
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {!selectedTraineeId && (
        <p className="text-sm text-gray-600">
          Select a trainee to review their Day 1 progress.
        </p>
      )}

      {/* CLEAN TASK LIST — MATCHES WEEK 1 */}
      {selectedTraineeId && (
        <ul className="flex flex-col gap-3">
          {tasks.map((t, idx) => {
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
                className="bg-white rounded-lg border p-4 flex justify-between items-center"
                style={{
                  borderColor: GRAY_BORDER,
                }}
              >
                {/* LEFT SIDE TITLE */}
                <div className="flex flex-col">
                  <span className="font-semibold text-sm">
                    {order}. {t.title ?? t.id}
                  </span>

                  <span className="text-xs text-gray-500 mt-1">
                    {done ? "Completed" : "Not completed"}
                  </span>
                </div>

                {/* RIGHT SIDE APPROVE BUTTON */}
                <button
                  onClick={() => toggleApproved(t.id, !approved)}
                  disabled={!done}
                  className="px-4 py-1 rounded-md border text-sm font-semibold"
                  style={{
                    borderColor: approved ? "#10b981" : "#d1d5db",
                    background: approved ? "#10b981" : "#f9fafb",
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
