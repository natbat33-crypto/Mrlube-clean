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

import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/* ----------------------------------
   TYPES
---------------------------------- */
type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
};

type ProgressItem = {
  done: boolean;
  approved: boolean;
};

type ProgressMap = Record<string, ProgressItem>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 9999;
}

/* ----------------------------------
   MAIN COMPONENT
---------------------------------- */
export default function Day1SupervisorPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [supervisorUid, setSupervisorUid] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const asParam = searchParams.get("as");

  const { storeId: ctxStoreId } = useStoreCtx();
  const [storeId, setStoreId] = useState<string | null>(ctxStoreId ?? null);
  const trainees = useSupervisorTrainees(storeId);

  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(
    asParam
  );

  /* ---------------- AUTH ---------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setSupervisorUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ---------------- STORE SYNC ---------------- */
  useEffect(() => {
    if (ctxStoreId) setStoreId(ctxStoreId);
  }, [ctxStoreId]);

  /* ---------------- DEFAULT TRAINEE ---------------- */
  useEffect(() => {
    if (asParam) {
      setSelectedTraineeId(asParam);
      return;
    }
    if (!selectedTraineeId && trainees.length > 0) {
      setSelectedTraineeId(trainees[0].traineeId);
    }
  }, [asParam, trainees, selectedTraineeId]);

  /* ---------------- LOAD TASKS ---------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingTasks(true);

        const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
        const list: Task[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order) - num(b.order ?? b.sort_order)
          );

        if (!alive) return;
        setTasks(list);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Failed to load tasks");
      } finally {
        if (alive) setLoadingTasks(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- LISTEN TO PROGRESS ---------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const qRef = query(
      collection(db, "users", selectedTraineeId, "progress"),
      where("week", "==", "day-1")
    );

    const unsub = onSnapshot(qRef, (snap) => {
      const map: ProgressMap = {};

      snap.forEach((d) => {
        const data = d.data() as any;
        const parts = d.id.split("__");
        const taskId = parts[parts.length - 1];

        map[taskId] = {
          done: !!data.done,
          approved: !!data.approved,
        };
      });

      setProgress(map);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* ---------------- AUTO-SET section approval ---------------- */
  useEffect(() => {
    if (!selectedTraineeId || tasks.length === 0) return;

    const allApproved =
      tasks.length > 0 &&
      tasks.every((t) => progress[t.id]?.approved === true);

    setDoc(
      doc(db, "users", selectedTraineeId, "sections", "day1"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
    ).catch((e) =>
      console.error("[Day1 supervisor] section approval write:", e)
    );
  }, [selectedTraineeId, tasks, progress]);

  /* ---------------- APPROVE TOGGLE ---------------- */
  async function toggleApprove(taskId: string, next: boolean) {
    if (!selectedTraineeId) return;

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
  }

  /* ---------------- COUNTS ---------------- */
  const doneCount = useMemo(
    () => tasks.filter((t) => progress[t.id]?.done).length,
    [tasks, progress]
  );

  const approvedCount = useMemo(
    () => tasks.filter((t) => progress[t.id]?.approved).length,
    [tasks, progress]
  );

  const pct = useMemo(
    () =>
      tasks.length ? Math.round((approvedCount / tasks.length) * 100) : 0,
    [approvedCount, tasks.length]
  );

  /* ---------------- UI ---------------- */
  if (authLoading || loadingTasks) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/supervisor"
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
      >
        ← Back to Dashboard
      </Link>

      {/* Trainee Selector */}
      {storeId && trainees.length > 0 && (
        <div className="space-y-1">
          <label className="text-sm text-muted-foreground">
            Reviewing trainee:
          </label>

          <select
            value={selectedTraineeId ?? ""}
            onChange={(e) => setSelectedTraineeId(e.target.value || null)}
            className="border rounded-md p-2 text-sm"
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

      {/* --- Day 1 Review Card (same UI style as Week 1) --- */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Review — Day 1</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Summary row */}
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{approvedCount}</span> approved •{" "}
              <span className="font-medium">{tasks.length - approvedCount}</span>{" "}
              waiting • <span className="font-medium">{pct}%</span> approved
            </div>

            <div className="ml-auto min-w-[220px]">
              <div className="flex justify-between text-xs mb-1">
                <span>Approved</span>
                <span className="text-black">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            </div>
          </div>

          {/* Task list */}
          {tasks.map((t, idx) => {
            const meta = t;
            const done = progress[t.id]?.done ?? false;
            const isApproved = progress[t.id]?.approved ?? false;

            return (
              <li
                key={t.id}
                className="list-none flex items-center justify-between gap-3 border rounded-md p-3 bg-white"
              >
                <div className="font-semibold text-sm break-words">
                  {meta.order ? `${meta.order}. ` : ""}
                  {meta.title}
                </div>

                <button
                  onClick={() => toggleApprove(t.id, !isApproved)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition ${
                    isApproved
                      ? "bg-green-600 text-white border-green-700 hover:bg-green-700"
                      : "bg-white border-gray-300 hover:bg-gray-50"
                  } ${!done ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!done}
                >
                  {isApproved ? "Unapprove" : "Approve"}
                </button>
              </li>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
