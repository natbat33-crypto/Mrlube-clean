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
   HELPERS — invariant persistence
---------------------------------- */
function getStoredReviewUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("reviewUid");
}

function setStoredReviewUid(uid: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("reviewUid", uid);
}

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

/* ----------------------------------
   MAIN COMPONENT
---------------------------------- */
export default function Day1SupervisorPage() {
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loadingTasks, setLoadingTasks] = useState(true);

  const searchParams = useSearchParams();
  const asParam = searchParams.get("as");

  const { storeId: ctxStoreId } = useStoreCtx();
  const trainees = useSupervisorTrainees(ctxStoreId ?? null);

  const selectedTraineeId = useMemo(() => {
    const uid = asParam ?? getStoredReviewUid() ?? "";
    if (uid) setStoredReviewUid(uid);
    return uid.trim();
  }, [asParam]);

  /* ---------------- AUTH ---------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, () => {
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ---------------- LOAD TASKS ---------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingTasks(true);

        const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
        const list: Task[] = [];

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
      } finally {
        if (alive) setLoadingTasks(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- HARD GUARD ---------------- */
  if (authLoading || loadingTasks) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  }

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
            <CardTitle>Review — Day 1</CardTitle>
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

  /* ---------------- LISTEN TO PROGRESS ---------------- */
  useEffect(() => {
    const qRef = query(
      collection(db, "users", selectedTraineeId, "progress"),
      where("week", "==", "day-1")
    );

    return onSnapshot(qRef, (snap) => {
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
  }, [selectedTraineeId]);

  /* ---------------- AUTO-SET SECTION APPROVAL ---------------- */
  useEffect(() => {
    if (tasks.length === 0) return;

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
    ).catch(() => {});
  }, [tasks, progress, selectedTraineeId]);

  /* ---------------- APPROVE TOGGLE ---------------- */
  async function toggleApprove(taskId: string, next: boolean) {
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
  const approvedCount = useMemo(
    () => tasks.filter((t) => progress[t.id]?.approved).length,
    [tasks, progress]
  );

  const pct = tasks.length
    ? Math.round((approvedCount / tasks.length) * 100)
    : 0;

  /* ---------------- UI ---------------- */
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
          <CardTitle>Review — Day 1</CardTitle>
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