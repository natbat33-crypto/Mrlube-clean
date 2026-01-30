"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { db } from "@/lib/firebase";
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

function num(v: any): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 9999;
}

/* ----------------------------------
   COMPONENT
---------------------------------- */
export default function SupervisorWeek2Page() {
  const searchParams = useSearchParams();
  const traineeId = searchParams.get("as"); // ✅ single source of truth

  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);

  /* ---------------- LOAD TASKS ---------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const snap = await getDocs(
          collection(db, "modules", "week2", "tasks")
        );

        const list: Task[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order) -
              num(b.order ?? b.sort_order)
          );

        if (alive) setTasks(list);
      } catch (e) {
        console.error("[Supervisor Week2] load tasks error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- LISTEN TO PROGRESS ---------------- */
  useEffect(() => {
    if (!traineeId) return;

    const qRef = query(
      collection(db, "users", traineeId, "progress"),
      where("week", "==", "week2")
    );

    const unsub = onSnapshot(qRef, (snap) => {
      const map: ProgressMap = {};

      snap.forEach((d) => {
        const parts = d.id.split("__");
        const taskId = parts[parts.length - 1];
        const data = d.data() as any;

        map[taskId] = {
          done: !!data.done,
          approved: !!data.approved,
        };
      });

      setProgress(map);
    });

    return unsub;
  }, [traineeId]);

  /* ---------------- AUTO-SET SECTION APPROVAL ---------------- */
  useEffect(() => {
    if (!traineeId || tasks.length === 0) return;

    const allApproved =
      tasks.length > 0 &&
      tasks.every((t) => progress[t.id]?.approved === true);

    setDoc(
      doc(db, "users", traineeId, "sections", "week2"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
    ).catch((e) =>
      console.error("[Supervisor Week2] section approval error:", e)
    );
  }, [traineeId, tasks, progress]);

  /* ---------------- APPROVE TOGGLE ---------------- */
  async function toggleApprove(taskId: string, next: boolean) {
    if (!traineeId) return;

    const key = `modules__week2__tasks__${taskId}`;

    await setDoc(
      doc(db, "users", traineeId, "progress", key),
      {
        approved: next,
        approvedAt: next ? serverTimestamp() : deleteField(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /* ---------------- COUNTS ---------------- */
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
  if (!traineeId) {
    return <div className="p-6">No trainee selected.</div>;
  }

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/supervisor"
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
      >
        ← Back to Dashboard
      </Link>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Review — Week 2</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{approvedCount}</span> approved •{" "}
              <span className="font-medium">
                {tasks.length - approvedCount}
              </span>{" "}
              waiting • <span className="font-medium">{pct}%</span>
            </div>

            <div className="ml-auto min-w-[220px]">
              <div className="flex justify-between text-xs mb-1">
                <span>Approved</span>
                <span className="text-black">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            </div>
          </div>

          <ul className="space-y-2">
            {tasks.map((t) => {
              const done = progress[t.id]?.done ?? false;
              const approved = progress[t.id]?.approved ?? false;

              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white"
                >
                  <div className="font-semibold text-sm break-words">
                    {t.order ? `${t.order}. ` : ""}
                    {t.title}
                  </div>

                  <button
                    onClick={() => toggleApprove(t.id, !approved)}
                    disabled={!done}
                    className={`px-3 py-1.5 rounded-md text-sm border transition ${
                      approved
                        ? "bg-green-600 text-white border-green-700 hover:bg-green-700"
                        : "bg-white border-gray-300 hover:bg-gray-50"
                    } ${!done ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {approved ? "Unapprove" : "Approve"}
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}




