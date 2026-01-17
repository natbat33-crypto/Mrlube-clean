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

  /* 1. AUTH LISTENER */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setSupervisorUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* 2. STORE ID SYNC */
  useEffect(() => {
    if (ctxStoreId) setStoreId(ctxStoreId);
  }, [ctxStoreId]);

  /* 3. DEFAULT TRAINEE */
  useEffect(() => {
    if (asParam) {
      setSelectedTraineeId(asParam);
      return;
    }
    if (!selectedTraineeId && trainees.length > 0) {
      setSelectedTraineeId(trainees[0].traineeId);
    }
  }, [asParam, trainees, selectedTraineeId]);

  /* 4. LOAD TASKS */
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

  /* 5. LISTEN FOR PROGRESS */
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

  /* 6. LISTEN FOR SECTION APPROVAL */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const ref = doc(db, "users", selectedTraineeId, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setSectionApproved(snap.data()?.approved === true);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* 7. AUTO SECTION APPROVAL WRITE */
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

  /* 8. APPROVE TOGGLE */
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

  /* 9. COUNTS */
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
     UI — MATCH WEEK 1 EXACTLY
  ---------------------------------- */
  return (
    <main className="p-6 max-w-3xl mx-auto">
      {/* BACK BUTTON */}
      <div className="mb-4">
        <Link
          href="/supervisor"
          className="inline-flex items-center gap-2 bg-white border border-gray-300 rounded-full px-4 py-2 font-semibold"
          style={{ color: NAVY }}
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

      {/* WEEK 1 STYLE TOP ROW */}
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-gray-700">
          {tasks.length - doneCount} waiting • {approvedCount} approved • {pct}% approved
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{pct}%</span>
          <div className="w-24 h-2 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full"
              style={{
                width: `${pct}%`,
                background: YELLOW,
                transition: "width .2s ease",
              }}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {!selectedTraineeId && (
        <p className="text-sm text-gray-600">
          Select a trainee to review their Day 1 progress.
        </p>
      )}

      {/* TASK LIST — SAME AS WEEK 1 */}
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

              return (
                <li
                  key={t.id}
                  className="bg-white rounded-xl p-4 border border-gray-200 flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="font-medium">
                      {order}. {t.title ?? t.id}
                    </div>
                  </div>

                  <button
                    onClick={() => toggleApproved(t.id, !prog.approved)}
                    className="px-4 py-1 rounded-md border text-sm font-medium"
                    style={{
                      background: prog.approved ? "#e6f4ea" : "#fff",
                      borderColor: prog.approved ? "#34a853" : "#d1d5db",
                      color: prog.approved ? "#1b5e20" : "#333",
                    }}
                  >
                    {prog.approved ? "Unapprove" : "Approve"}
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </main>
  );
}
