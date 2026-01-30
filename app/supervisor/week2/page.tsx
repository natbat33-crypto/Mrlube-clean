"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { auth, db } from "@/lib/firebase";
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
  getDoc,
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

type Trainee = {
  id: string;
  name: string;
};

function num(v: any): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 9999;
}

export default function SupervisorWeek2Page() {
  const [traineeId, setTraineeId] = useState<string | null>(null);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);

  /* ---------------- LOAD TRAINEES (THE MISSING PIECE) ---------------- */
  useEffect(() => {
    (async () => {
      const sup = auth.currentUser;
      if (!sup) return;

      // find trainees assigned to this supervisor
      const snap = await getDocs(
        query(
          collection(db, "stores", "24", "trainees"),
          where("active", "==", true),
          where("supervisorId", "==", sup.uid)
        )
      );

      const list: Trainee[] = [];

      for (const d of snap.docs) {
        const uSnap = await getDoc(doc(db, "users", d.id));
        const u = uSnap.exists() ? uSnap.data() : {};
        list.push({
          id: d.id,
          name: (u as any).name || (u as any).email || d.id,
        });
      }

      setTrainees(list);

      // auto-select trainee
      const stored = localStorage.getItem("reviewUid");
      const resolved =
        (stored && list.find((t) => t.id === stored)?.id) || list[0]?.id;

      if (resolved) {
        setTraineeId(resolved);
        localStorage.setItem("reviewUid", resolved);
      }
    })();
  }, []);

  /* ---------------- LOAD TASKS ---------------- */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        collection(db, "modules", "week2", "tasks")
      );

      setTasks(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order) -
              num(b.order ?? b.sort_order)
          )
      );

      setLoading(false);
    })();
  }, []);

  /* ---------------- LISTEN TO PROGRESS ---------------- */
  useEffect(() => {
    if (!traineeId) return;

    const qRef = query(
      collection(db, "users", traineeId, "progress"),
      where("week", "==", "week2")
    );

    return onSnapshot(qRef, (snap) => {
      const map: ProgressMap = {};
      snap.forEach((d) => {
        const taskId = d.id.split("__").pop()!;
        const data = d.data() as any;
        map[taskId] = {
          done: !!data.done,
          approved: !!data.approved,
        };
      });
      setProgress(map);
    });
  }, [traineeId]);

  /* ---------------- AUTO-SECTION APPROVAL ---------------- */
  useEffect(() => {
    if (!traineeId || tasks.length === 0) return;

    const allApproved = tasks.every(
      (t) => progress[t.id]?.approved === true
    );

    setDoc(
      doc(db, "users", traineeId, "sections", "week2"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
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

  if (loading) return <div className="p-6">Loading…</div>;
  if (!traineeId) return <div className="p-6">No trainee selected.</div>;

  const approvedCount = tasks.filter(
    (t) => progress[t.id]?.approved
  ).length;

  const pct = tasks.length
    ? Math.round((approvedCount / tasks.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <Link href="/supervisor" className="rounded-full border px-3 py-1.5 bg-white text-sm">
        ← Back to Dashboard
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Review — Week 2</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />

          <ul className="space-y-2">
            {tasks.map((t) => {
              const done = progress[t.id]?.done;
              const approved = progress[t.id]?.approved;

              return (
                <li
                  key={t.id}
                  className="flex justify-between items-center border rounded p-3 bg-white"
                >
                  <div className="font-semibold text-sm">
                    {t.order}. {t.title}
                  </div>

                  <button
                    disabled={!done}
                    onClick={() => toggleApprove(t.id, !approved)}
                    className={`px-3 py-1.5 rounded text-sm ${
                      approved
                        ? "bg-green-600 text-white"
                        : "border"
                    } ${!done ? "opacity-50" : ""}`}
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




