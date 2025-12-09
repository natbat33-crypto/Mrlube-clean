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

async function resolveStoreId(): Promise<string> {
  const u = auth.currentUser;

  if (u) {
    const tok = await u.getIdTokenResult(true);
    if (tok?.claims?.storeId) return String(tok.claims.storeId);
  }

  if (typeof window !== "undefined") {
    const ls = localStorage.getItem("storeId");
    if (ls) return ls;
  }

  if (u) {
    const guess = ["24", "26", "262", "276", "298", "46", "79", "163"];
    for (const sid of guess) {
      const snap = await getDoc(doc(db, "stores", sid, "employees", u.uid));
      if (snap.exists()) return sid;
    }
  }

  return "";
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

  /* Load trainees correctly */
  useEffect(() => {
    (async () => {
      try {
        const sid = await resolveStoreId();
        setStoreId(sid);

        if (!sid) return;

        const sup = auth.currentUser;
        if (!sup) return;

        const traineesSnap = await getDocs(
          query(
            collection(db, "stores", sid, "trainees"),
            where("active", "==", true),
            where("supervisorId", "==", sup.uid)
          )
        );

        const list: { id: string; name: string }[] = [];

        for (const d of traineesSnap.docs) {
          const uSnap = await getDoc(doc(db, "users", d.id));
          const u = uSnap.exists() ? uSnap.data() : {};

          // 🟢 FIXED — ALWAYS prefer email if it exists
          let name: string =
            (u as any).email?.trim?.() ||
            (u as any).name ||
            (u as any).displayName ||
            d.id;

          list.push({
            id: d.id, // keep UID
            name, // show email (or fallback)
          });
        }

        setTrainees(list);

        if (list.length > 0) setSelectedTrainee(list[0].id);
      } catch (err) {
        console.error("Week4 trainee load error:", err);
      }
    })();
  }, []);

  /* Load Week 4 Tasks */
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "modules", "week4", "tasks"));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

        list.sort(
          (a, b) =>
            (a.order ?? a.sort_order ?? 9999) -
            (b.order ?? b.sort_order ?? 9999)
        );

        const filtered = list.filter(
          (t) =>
            !t.title?.toLowerCase().includes("tia basic") &&
            !t.id?.toLowerCase().includes("t01")
        );

        setTasks(filtered);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="p-6">Loading…</main>;

  if (trainees.length === 0) {
    return (
      <main className="p-6 text-sm">
        <Link
          href="/supervisor"
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 bg-white text-sm mb-4"
        >
          ← Back
        </Link>

        <p className="text-red-600">
          No trainees assigned. Ensure your manager assigns a trainee to you.
        </p>
      </main>
    );
  }

  const traineeId = selectedTrainee!;

  return (
    <div className="space-y-6">
      <Link
        href="/supervisor"
        className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm"
      >
        ← Back to Dashboard
      </Link>

      <h2 className="text-xl font-semibold">Week 4 — Timers</h2>

      {/* Trainee Selector */}
      <div className="flex gap-2 items-center">
        <span className="text-sm">Trainee:</span>
        <select
          value={traineeId}
          onChange={(e) => setSelectedTrainee(e.target.value)}
          className="border px-2 py-1 rounded-md text-sm"
        >
          {trainees.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-muted-foreground">
        Start/stop timers while observing the trainee. Results save automatically.
      </p>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {tasks.map((t) => (
          <TimerCard key={t.id} task={t} uid={traineeId} storeId={storeId} />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------- */
/* TimerCard Component                    */
/* -------------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2 bg-slate-50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function TimerCard({
  task,
  uid,
  storeId,
}: {
  task: any;
  uid: string;
  storeId: string;
}) {
  const { aggRef, sessionsCol } = useMemo(
    () => timerRefs(uid, task.id),
    [uid, task.id]
  );

  const [sessions, setSessions] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const startRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const [, setNow] = useState(0);

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

  function start() {
    if (running) return;
    startRef.current = Date.now();
    setRunning(true);
    tickRef.current = window.setInterval(() => setNow(Date.now()), 200);
  }

  async function stop() {
    if (!running || !startRef.current) return;

    const elapsed = Date.now() - startRef.current;
    clearInterval(tickRef.current!);

    startRef.current = null;
    tickRef.current = null;
    setRunning(false);

    await addDoc(sessionsCol, {
      ms: elapsed,
      createdAt: serverTimestamp(),
    });

    const newCount = count + 1;
    const newBest = bestMs !== undefined ? Math.min(bestMs, elapsed) : elapsed;
    const newAvg =
      count > 0 ? Math.round((avgMs! * count + elapsed) / newCount) : elapsed;

    await setDoc(
      aggRef,
      {
        lastMs: elapsed,
        bestMs: newBest,
        avgMs: newAvg,
        count: newCount,
        updatedAt: serverTimestamp(),
        title: task.title ?? task.id,
      },
      { merge: true }
    );

    // Write progress doc for gating
    const key = `modules__week4__tasks__${task.id}`;

    await setDoc(
      doc(db, "users", uid, "progress", key),
      {
        path: `modules/week4/tasks/${task.id}`,
        week: "week4",
        storeId,
        traineeId: uid,
        title: task.title ?? task.id,
        done: true,
        lastMs: elapsed,
        bestMs: newBest,
        avgMs: newAvg,
        count: newCount,
        completedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const allSnap = await getDocs(
      query(
        collection(db, "users", uid, "progress"),
        where("week", "==", "week4"),
        where("done", "==", true)
      )
    );

    const all = allSnap.docs.map((d) => d.data());
    const allDone = all.length > 0 && all.every((t) => (t as any).done === true);

    const sectionRef = doc(db, "users", uid, "sections", "week4");

    await setDoc(
      sectionRef,
      {
        approved: allDone,
        approvedAt: allDone ? serverTimestamp() : undefined,
      },
      { merge: true }
    );
  }

  function resetLocal() {
    setRunning(false);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    startRef.current = null;
  }

  const elapsedDisplay =
    running && startRef.current
      ? msToClock(Date.now() - startRef.current)
      : "00:00";

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="mb-1 text-sm text-muted-foreground">
        {task.title ?? task.id}
      </div>

      <div className="text-4xl font-bold tracking-widest mb-3">
        {elapsedDisplay}
      </div>

      <div className="flex items-center gap-2 mb-4">
        {!running ? (
          <button
            onClick={start}
            className="px-3 py-1.5 rounded-md bg-primary text-white text-sm"
          >
            Start
          </button>
        ) : (
          <button
            onClick={stop}
            className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm"
          >
            Stop &amp; Save
          </button>
        )}

        <button
          onClick={resetLocal}
          className="px-3 py-1.5 rounded-md border text-sm"
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Last" value={lastMs ? msToClock(lastMs) : "—"} />
        <Stat label="Best" value={bestMs ? msToClock(bestMs) : "—"} />
        <Stat label="Average" value={avgMs ? msToClock(avgMs) : "—"} />
      </div>

      <div className="mt-2 text-xs text-muted-foreground">Sessions {count}</div>
    </div>
  );
}
