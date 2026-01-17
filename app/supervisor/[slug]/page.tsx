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

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
     UI (MATCHES WEEK 1)
  ---------------------------------- */
  return (
    <main className="space-y-6 max-w-3xl mx-auto p-6">
      {/* Back (MATCH WEEK 1 TEXT & STYLE) */}
      <Link
        href="/supervisor"
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
      >
        ← Back to Dashboard
      </Link>

      {/* Trainee selector (kept) */}
      {storeId && trainees.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Reviewing trainee:
          </label>

          <select
            value={selectedTraineeId ?? ""}
            onChange={(e) => setSelectedTraineeId(e.target.value || null)}
            className="border rounded-md p-2 text-sm min-w-[260px]"
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

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Review — Day 1</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* HEADER ROW (MATCH WEEK 1) */}
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{waitingCount}</span> waiting •{" "}
              <span className="font-medium">{approvedCount}</span> approved •{" "}
              <span className="font-medium">{pct}%</span> approved
            </div>

            <div className="ml-auto min-w-[220px]">
              <div className="flex justify-between text-xs mb-1">
                <span>Approved</span>
                <span className="text-black">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600">
              Error: {error}
            </p>
          )}

          {!selectedTraineeId ? (
            <p className="text-sm text-muted-foreground">
              Select a trainee to review their Day 1 progress.
            </p>
          ) : (
            <ul className="space-y-2">
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
                      className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white"
                    >
                      <div className="font-semibold text-sm break-words">
                        {order ? `${order}. ` : ""}
                        {t.title ?? t.id}
                      </div>

                      <button
                        onClick={() => toggleApproved(t.id, !approved)}
                        disabled={!done}
                        className={`px-3 py-1.5 rounded-md text-sm border transition
                          ${
                            approved
                              ? "bg-green-600 text-white border-green-700 hover:bg-green-700"
                              : "bg-white border-gray-300 hover:bg-gray-50"
                          }
                          ${!done ? "opacity-50 cursor-not-allowed" : ""}
                        `}
                      >
                        {approved ? "Unapprove" : "Approve"}
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
