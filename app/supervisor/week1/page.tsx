"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
  deleteField,
  onSnapshot,
} from "firebase/firestore";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/* ============================================
   HELPERS — invariant persistence
============================================ */
function getStoredReviewUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("reviewUid");
}

function setStoredReviewUid(uid: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("reviewUid", uid);
}

/* ============================================
   TYPES
============================================ */
type TaskMeta = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
};

type ProgressItem = {
  done?: boolean;
  approved?: boolean;
};

type ProgressMap = Record<string, ProgressItem>;

/* ============================================
   HELPERS
============================================ */
function getTaskKey(id: string) {
  const parts = id.split("__");
  return parts[parts.length - 1];
}

/* ============================================
   COMPONENT
============================================ */
export default function SupervisorWeek1Page() {
  const searchParams = useSearchParams();
  const asParam = searchParams.get("as");

  const selectedTraineeId = useMemo(() => {
    const uid = asParam ?? getStoredReviewUid() ?? "";
    if (uid) setStoredReviewUid(uid);
    return uid.trim();
  }, [asParam]);

  const [tasks, setTasks] = useState<TaskMeta[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);

  /* ============================================
     HARD GUARD — NO TRAINEE, NO READS
  ============================================ */
  if (!selectedTraineeId) {
    return (
      <div className="space-y-6">
        <Link
          href={`/supervisor`}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
        >
          ← Back to Dashboard
        </Link>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Review — Week 1</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No trainee selected.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ============================================
     LOAD TASKS
  ============================================ */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const snap = await getDocs(
          collection(db, "modules", "week1", "tasks")
        );

        const list: TaskMeta[] = [];

        snap.docs.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as any) });
        });

        list.sort((a, b) => {
          const oa = a.order ?? a.sort_order ?? 9999;
          const ob = b.order ?? b.sort_order ?? 9999;
          return oa - ob;
        });

        if (!alive) return;
        setTasks(list);
      } catch (e) {
        console.error("[Supervisor Week1] task load error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ============================================
     LISTEN TO TRAINEE PROGRESS (SCOPED)
  ============================================ */
  useEffect(() => {
    const qRef = query(
      collection(db, "users", selectedTraineeId, "progress"),
      where("week", "==", "week1")
    );

    return onSnapshot(qRef, (snap) => {
      const map: ProgressMap = {};

      snap.forEach((d) => {
        const key = getTaskKey(d.id);
        map[key] = {
          done: !!d.data()?.done,
          approved: !!d.data()?.approved,
        };
      });

      setProgress(map);
    });
  }, [selectedTraineeId]);

  /* ============================================
     AUTO-SET SECTION APPROVAL (SCOPED)
  ============================================ */
  useEffect(() => {
    if (tasks.length === 0) return;

    const allApproved =
      tasks.length > 0 &&
      tasks.every((t) => progress[t.id]?.approved === true);

    setDoc(
      doc(db, "users", selectedTraineeId, "sections", "week1"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
    ).catch((e) =>
      console.error("[Week1 supervisor] section approval write:", e)
    );
  }, [tasks, progress, selectedTraineeId]);

  /* ============================================
     APPROVE / UNAPPROVE TASK
  ============================================ */
  async function toggleApprove(taskId: string, next: boolean) {
    const key = `modules__week1__tasks__${taskId}`;

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

  /* ============================================
     UI COMPUTED
  ============================================ */
  const approvedCount = useMemo(
    () => tasks.filter((t) => progress[t.id]?.approved).length,
    [tasks, progress]
  );

  const pct = tasks.length
    ? Math.round((approvedCount / tasks.length) * 100)
    : 0;

  /* ============================================
     RENDER
  ============================================ */
  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/supervisor?as=${selectedTraineeId}`}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
      >
        ← Back to Dashboard
      </Link>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Review — Week 1</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{approvedCount}</span> approved •{" "}
              <span className="font-medium">
                {tasks.length - approvedCount}
              </span>{" "}
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

          <ul className="space-y-2">
            {tasks.map((t) => {
              const approved = progress[t.id]?.approved ?? false;
              const done = progress[t.id]?.done ?? false;

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
