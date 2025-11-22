// components/manager/TraineeProgress.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

type Props = {
  traineeId: string;           // user doc id (fallback)
  traineeUid?: string | null;  // preferred: auth UID used under users/{uid}/progress
};

const YELLOW = "#FFC20E";

// tiny helper: fetch tasks for one week from the "modules" collection first,
// and fall back to "weeks" if needed. Returns [{id,title}]
async function fetchWeekTaskRows(week: 1 | 2 | 3 | 4) {
  // Prefer: modules where field week == N (and use its /tasks)
  try {
    const mods = await getDocs(query(collection(db, "modules"), where("week", "==", week)));
    if (!mods.empty) {
      // choose the obvious doc (week-N, or first)
      const chosen =
        mods.docs.find((d) => d.id === `week-${week}`) ||
        mods.docs.find((d) => d.id === `week${week}`) ||
        mods.docs[0];
      const ts = await getDocs(collection(db, "modules", chosen.id, "tasks"));
      return ts.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title || d.id }));
    }
  } catch {}
  // Fallback: conventional week paths
  for (const path of [
    ["weeks", `week-${week}`, "tasks"],
    ["weeks", `week${week}`, "tasks"],
    ["modules", `week-${week}`, "tasks"],
    ["modules", `week${week}`, "tasks"],
  ] as const) {
    try {
      // ✅ TS-safe: avoid spreading unknown tuple directly
      const [p0, ...rest] = path;
      const snap = await getDocs(collection(db, p0, ...rest));
      if (!snap.empty) {
        return snap.docs.map((d) => ({ id: d.id, title: (d.data() as any)?.title || d.id }));
      }
    } catch {}
  }
  return [] as Array<{ id: string; title: string }>;
}

export default function TraineeProgress({ traineeId, traineeUid }: Props) {
  // Use the auth uid when we have it; that’s the path used by the trainee app
  const userKey = useMemo(
    () => (traineeUid ? String(traineeUid) : String(traineeId)),
    [traineeUid, traineeId]
  );

  const [total, setTotal] = useState<number>(0);
  const [done, setDone] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let stopProgressListener: (() => void) | null = null;

    (async () => {
      setLoading(true);

      // 1) Load all Week 1–4 tasks (catalog). We’ll merge and de-dupe by id.
      const [w1, w2, w3, w4] = await Promise.all([
        fetchWeekTaskRows(1),
        fetchWeekTaskRows(2),
        fetchWeekTaskRows(3),
        fetchWeekTaskRows(4),
      ]);

      const merged = new Map<string, { id: string; title: string }>();
      [...w1, ...w2, ...w3, ...w4].forEach((t) => merged.set(t.id, t));
      const tasks = Array.from(merged.values());
      const taskIdSet = new Set(tasks.map((t) => t.id));

      if (!alive) return;
      setTotal(tasks.length);

      // 2) Live progress reader (same place the trainee/supervisor write to)
      stopProgressListener = onSnapshot(
        collection(db, "users", userKey, "progress"),
        (snap) => {
          if (!alive) return;
          let count = 0;
          snap.forEach((d) => {
            // Count only if this progress doc corresponds to a known Week 1–4 task
            if (taskIdSet.has(d.id)) {
              const p: any = d.data();
              // Be lenient: treat presence (old data) as done when done flag missing
              const isDone = p?.done === true || typeof p?.done === "undefined";
              if (isDone) count += 1;
            }
          });
          setDone(count);
          setLoading(false);
        }
      );
    })();

    return () => {
      alive = false;
      if (stopProgressListener) stopProgressListener();
    };
  }, [userKey]);

  // --- UI (compact) ---
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-40 h-2 bg-gray-200 rounded overflow-hidden">
          <div className="h-full bg-gray-300 animate-pulse" style={{ width: "50%" }} />
        </div>
        <span className="text-xs text-gray-500">…</span>
      </div>
    );
  }

  if (total === 0) {
    return <span className="text-xs text-gray-500">No week tasks</span>;
  }

  const pct = Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-40 h-2 bg-gray-200 rounded overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: YELLOW }} />
      </div>
      <span className="text-xs text-gray-700">
        {pct}% <span className="text-gray-400">({done}/{total})</span>
      </span>
    </div>
  );
}


