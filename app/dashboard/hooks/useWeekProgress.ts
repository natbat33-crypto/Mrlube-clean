"use client";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase"; // from app/dashboard/hooks -> lib
import {
  collection, doc, getDocs, query, where, setDoc, deleteDoc, serverTimestamp
} from "firebase/firestore";

export function useWeekProgress(weekId: string, uid?: string | null) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!uid) { setDoneIds(new Set()); setLoading(false); return; }

    (async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, "users", uid, "progress"),
          where("moduleId", "==", weekId),
          where("done", "==", true)
        );
        const snap = await getDocs(q);
        const s = new Set<string>();
        snap.forEach(d => s.add(d.id));
        if (alive) setDoneIds(s);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [weekId, uid]);

  const isDone = (taskId: string) => doneIds.has(taskId);

  const toggle = async (taskId: string, next: boolean) => {
    if (!uid) return;
    const ref = doc(db, "users", uid, "progress", taskId);
    if (next) {
      await setDoc(ref, { moduleId: weekId, done: true, updatedAt: serverTimestamp() }, { merge: true });
      setDoneIds(new Set(doneIds).add(taskId));
    } else {
      await deleteDoc(ref);
      const copy = new Set(doneIds);
      copy.delete(taskId);
      setDoneIds(copy);
    }
  };

  return { loading, isDone, toggle, doneCount: doneIds.size };
}