"use client";
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

function getStoredReviewUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("reviewUid");
}

function setStoredReviewUid(uid: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("reviewUid", uid);
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
    const peek = ["24", "26", "262", "276", "298", "46", "79", "163"];
    for (const sid of peek) {
      const snap = await getDoc(doc(db, "stores", sid, "employees", u.uid));
      if (snap.exists()) return sid;
    }
  }

  return "";
}

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
  const searchParams = useSearchParams();
  const asParam = searchParams.get("as");

  const [storeId, setStoreId] = useState("");
  const [trainees, setTrainees] = useState<{ id: string; name: string }[]>([]);
  const [selectedTrainee, setSelectedTrainee] = useState<string | null>(asParam);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------------- LOCK TRAINEE CONTEXT ---------------- */
  useEffect(() => {
    if (asParam) {
      setSelectedTrainee(asParam);
      setStoredReviewUid(asParam);
      return;
    }

    const stored = getStoredReviewUid();
    if (!selectedTrainee && stored) {
      setSelectedTrainee(stored);
    }
  }, [asParam, selectedTrainee]);

  /* ---------------- RESOLVE STORE ---------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const sid = await resolveStoreId();
      if (!alive) return;
      setStoreId(sid);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------------- LOAD TRAINEES (FALLBACK) ---------------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const sup = auth.currentUser;
      if (!sup) return;

      const traineesSnap = await getDocs(
        query(
          collection(db, "stores", storeId, "trainees"),
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

      // If we still don't have a trainee selected, pick one and persist it
      if (!selectedTrainee && list.length) {
        const stored = getStoredReviewUid();
        const resolved =
          (stored && list.find((t) => t.id === stored)?.id) || list[0]?.id;

        if (resolved) {
          setSelectedTrainee(resolved);
          setStoredReviewUid(resolved);
        }
      }
    })();
  }, [storeId, selectedTrainee]);

  /* ---------------- LOAD TASKS ---------------- */
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
  if (!selectedTrainee) return <main className="p-6">No trainee selected.</main>;

  return (
    <div className="space-y-6">
      <Link
        href={`/supervisor?as=${selectedTrainee}`}
        className="rounded-full border px-3 py-1.5 bg-white text-sm"
      >
        ← Back to Dashboard
      </Link>

      <h2 className="text-xl font-semibold">Week 4</h2>

      <select
        value={selectedTrainee}
        onChange={(e) => {
          const next = e.target.value;
          setSelectedTrainee(next);
          setStoredReviewUid(next);
        }}
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
          const isApprovalTask = task.order === 1 || task.sort_order === 1;

          return isApprovalTask ? (
            <ApprovalCard key={task.id} task={task} uid={selectedTrainee} />
          ) : (
            <TimerCard key={task.id} task={task} uid={selectedTrainee} />
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
