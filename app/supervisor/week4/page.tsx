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

  /* Load trainees */
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

          const name =
            (u as any).email?.trim?.() ||
            (u as any).name ||
            (u as any).displayName ||
            d.id;

          list.push({ id: d.id, name });
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

        setTasks(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="p-6">Loading…</main>;
  if (trainees.length === 0) {
    return (
      <main className="p-6 text-sm">
        <Link href="/supervisor" className="rounded-full border px-3 py-1.5">
          ← Back
        </Link>
        <p className="text-red-600 mt-4">No trainees assigned.</p>
      </main>
    );
  }

  const traineeId = selectedTrainee!;

  return (
    <div className="space-y-6">
      <Link href="/supervisor" className="rounded-full border px-3 py-1.5 bg-white text-sm">
        ← Back to Dashboard
      </Link>

      <h2 className="text-xl font-semibold">Week 4 — Timers</h2>

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

function TimerCard({ task, uid, storeId }: any) {
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

    await addDoc(sessionsCol, { ms: elapsed, createdAt: serverTimestamp() });

    const key = `modules__week4__tasks__${task.id}`;

    await setDoc(
      doc(db, "users", uid, "progress", key),
      {
        path: `modules/week4/tasks/${task.id}`,
        week: "week4",
        storeId,
        traineeId: uid,
        done: true,
        completedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /* 🔒 AUTHORITATIVE WEEK-4 ENFORCEMENT */
  useEffect(() => {
    const q = query(
      collection(db, "users", uid, "progress"),
      where("week", "==", "week4")
    );

    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => d.data());
      const allDone = docs.length > 0 && docs.every((d) => d.done === true);

      setDoc(
        doc(db, "users", uid, "sections", "week4"),
        {
          approved: allDone,
          approvedAt: allDone ? serverTimestamp() : deleteField(),
        },
        { merge: true }
      );
    });
  }, [uid]);

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="text-sm mb-2">{task.title ?? task.id}</div>
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

