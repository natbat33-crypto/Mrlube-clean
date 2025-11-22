// app/supervisor/week4/page.tsx
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

/* ---------- store resolver (same style as other weeks) ---------- */
async function resolveStoreId(): Promise<string> {
  const u = auth.currentUser;
  if (u) {
    const tok = await u.getIdTokenResult(true);
    if (tok?.claims?.storeId) return String(tok.claims.storeId);
  }
  if (typeof window !== "undefined") {
    const ls = localStorage.getItem("storeId");
    if (ls) return String(ls);
  }
  if (u) {
    const peek = ["24", "26", "262", "276", "298", "46", "79", "163"];
    for (const sid of peek) {
      const snap = await getDoc(doc(db, "stores", sid, "employees", u.uid));
      if (snap.exists()) return sid;
    }
  }
  return "";
}

export default function SupervisorWeek4Page() {
  const [storeId, setStoreId] = useState<string>("");
  const [traineeUid, setTraineeUid] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ Resolve store + assigned trainee
  useEffect(() => {
    (async () => {
      try {
        const sup = auth.currentUser;
        if (!sup) {
          setTraineeUid(null);
          return;
        }

        const sid = await resolveStoreId();
        setStoreId(sid);

        if (!sid) {
          setTraineeUid(null);
          return;
        }

        // Find trainees assigned to this supervisor for this store
        const traineesCol = collection(db, "stores", sid, "trainees");
        const qy = query(
          traineesCol,
          where("supervisorId", "==", sup.uid),
          where("active", "==", true)
        );
        const snap = await getDocs(qy);

        if (!snap.empty) {
          // For now, use the first assigned trainee
          setTraineeUid(snap.docs[0].id);
        } else {
          setTraineeUid(null);
        }
      } catch {
        setTraineeUid(null);
      }
    })();
  }, []);

  // ✅ Load tasks (skip Task 1, same as before)
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
        // 🚫 exclude Task 1 (TIA basic)
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

  if (loading) return <main className="p-6">Loading...</main>;

  if (!traineeUid || !storeId) {
    return (
      <main className="p-6 text-sm">
        <Link
          href="/supervisor"
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition mb-4"
        >
          ← Back to Dashboard
        </Link>
        <p className="text-red-600">
          Could not resolve an assigned trainee for this store. Make sure the manager
          has assigned a trainee to you under{" "}
          <code>stores/{storeId || "your-store"}/trainees</code> with a matching{" "}
          <code>supervisorId</code>.
        </p>
      </main>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/supervisor"
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <h2 className="text-xl font-semibold">Week 4 — Timers</h2>
      <p className="text-sm text-muted-foreground">
        Start/stop timers while observing the trainee. Each run updates their
        dashboard automatically.
      </p>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {tasks.map((t) => (
          <TimerCard key={t.id} task={t} uid={traineeUid} storeId={storeId} />
        ))}
      </div>
    </div>
  );
}

/* ---------- TimerCard component ---------- */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2 bg-slate-50">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function TimerCard({ task, uid, storeId }: { task: any; uid: string; storeId: string }) {
  const { aggRef, sessionsCol } = useMemo(
    () => timerRefs(uid, task.id),
    [uid, task.id]
  );
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    const qy = query(sessionsCol, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(qy, (snap) => {
      setSessions(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
  }, [sessionsCol]);

  const count = sessions.length;
  const lastMs = count ? sessions[count - 1].ms : undefined;
  const bestMs = count ? Math.min(...sessions.map((s) => s.ms)) : undefined;
  const avgMs = count ? avg(sessions.map((s) => s.ms)) : undefined;

  const [running, setRunning] = useState(false);
  const startRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const [, setNow] = useState(0);

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
    tickRef.current = null;
    startRef.current = null;
    setRunning(false);

    // session doc
    await addDoc(sessionsCol, { ms: elapsed, createdAt: serverTimestamp() });

    const newCount = count + 1;
    const newBest = bestMs !== undefined ? Math.min(bestMs, elapsed) : elapsed;
    const newAvg =
      count > 0 ? Math.round((avgMs! * count + elapsed) / newCount) : elapsed;

    // aggregate timers
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

    // progress doc for trainee dashboard + supervisor views
    const progressKey = `modules__week4__tasks__${task.id}`;
    await setDoc(
      doc(db, "users", uid, "progress", progressKey),
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
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  function resetLocal() {
    setRunning(false);
    if (tickRef.current) clearInterval(tickRef.current);
    startRef.current = null;
    tickRef.current = null;
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
            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm"
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