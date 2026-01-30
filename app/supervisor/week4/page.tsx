"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  getDoc,
  deleteField,
} from "firebase/firestore";

/* -------------------------------------- */
/* Helpers                                */
/* -------------------------------------- */

function msToClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function avg(nums: number[]) {
  return nums.length
    ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
    : 0;
}

function timerRefs(uid: string, taskId: string) {
  const aggRef = doc(db, "users", uid, "timers", "week4", "tasks", taskId);
  const sessionsCol = collection(aggRef, "sessions");
  return { aggRef, sessionsCol };
}

/* -------------------------------------- */
/* Supervisor Week 4 Page                 */
/* -------------------------------------- */

export default function SupervisorWeek4Page() {
  const [storeId, setStoreId] = useState("");
  const [trainees, setTrainees] = useState<{ id: string; name: string }[]>([]);
  const [selectedTrainee, setSelectedTrainee] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const sup = auth.currentUser;
      if (!sup) return;

      const traineesSnap = await getDocs(
        query(
          collection(db, "stores", "24", "trainees"),
          where("active", "==", true),
          where("supervisorId", "==", sup.uid)
        )
      );

      const list: any[] = [];
      for (const d of traineesSnap.docs) {
        const uSnap = await getDoc(doc(db, "users", d.id));
        const u = uSnap.exists() ? uSnap.data() : {};
        list.push({
          id: d.id,
          name: (u as any).name || (u as any).email || d.id,
        });
      }

      setTrainees(list);
      if (list.length) setSelectedTrainee(list[0].id);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "modules", "week4", "tasks"));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      list.sort(
        (a, b) =>
          (a.order ?? a.sort_order ?? 9999) -
          (b.order ?? b.sort_order ?? 9999)
      );
      setTasks(list);
      setLoading(false);
    })();
  }, []);

  if (loading) return <main className="p-6">Loading…</main>;
  if (!selectedTrainee) return null;

  return (
    <div className="space-y-6">
      <Link href="/supervisor" className="rounded-full border px-3 py-1.5 bg-white text-sm">
        ← Back to Dashboard
      </Link>

      <h2 className="text-xl font-semibold">Week 4</h2>

      <select
        value={selectedTrainee}
        onChange={(e) => setSelectedTrainee(e.target.value)}
        className="border px-2 py-1 rounded-md text-sm"
      >
        {trainees.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {tasks.map((task) => {
          const isApprovalTask =
            task.order === 1 || task.sort_order === 1;

          return isApprovalTask ? (
            <ApprovalCard
              key={task.id}
              task={task}
              uid={selectedTrainee}
            />
          ) : (
            <TimerCard
              key={task.id}
              task={task}
              uid={selectedTrainee}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------- */
/* Approval Task (FIRST TASK ONLY)         */
/* -------------------------------------- */

function ApprovalCard({ task, uid }: any) {
  const key = `modules__week4__tasks__${task.id}`;

  async function approve() {
    await setDoc(
      doc(db, "users", uid, "progress", key),
      {
        week: "week4",
        traineeId: uid,
        done: true,
        approved: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-sm mb-3">{task.title}</div>
      <button
        onClick={approve}
        className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm"
      >
        Approve
      </button>
    </div>
  );
}

/* -------------------------------------- */
/* Timer Task Card (UNCHANGED CORE)        */
/* -------------------------------------- */

function TimerCard({ task, uid }: any) {
  const { aggRef, sessionsCol } = useMemo(
    () => timerRefs(uid, task.id),
    [uid, task.id]
  );

  const [sessions, setSessions] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const qy = query(sessionsCol, orderBy("createdAt", "asc"));
    return onSnapshot(qy, (snap) => {
      setSessions(snap.docs.map((d) => d.data()));
    });
  }, [sessionsCol]);

  const count = sessions.length;
  const lastMs = count ? sessions[count - 1].ms : undefined;
  const bestMs = count ? Math.min(...sessions.map((s) => s.ms)) : undefined;
  const avgMs = count ? avg(sessions.map((s) => s.ms)) : undefined;

  async function stop() {
    if (!startRef.current) return;
    const elapsed = Date.now() - startRef.current;
    startRef.current = null;
    setRunning(false);

    await addDoc(sessionsCol, {
      ms: elapsed,
      createdAt: serverTimestamp(),
    });

    const key = `modules__week4__tasks__${task.id}`;

    await setDoc(
      doc(db, "users", uid, "progress", key),
      {
        week: "week4",
        traineeId: uid,
        done: true,
        lastMs: elapsed,
        bestMs,
        avgMs,
        count: count + 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-sm mb-2">{task.title}</div>

      <button
        onClick={() => {
          if (!running) {
            startRef.current = Date.now();
            setRunning(true);
          } else {
            stop();
          }
        }}
        className="px-3 py-1.5 rounded-md bg-primary text-white text-sm"
      >
        {running ? "Stop & Save" : "Start"}
      </button>

      <div className="mt-3 text-xs text-muted-foreground">
        Sessions {count} · Last {lastMs ? msToClock(lastMs) : "—"}
      </div>
    </div>
  );
}
