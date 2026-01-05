"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";

import { collection, getCountFromServer } from "firebase/firestore";

export function useTaskCount(weekId: string) {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const col = collection(db, "modules", weekId, "tasks");
        const snap = await getCountFromServer(col);
        if (alive) setCount(snap.data().count || 0);
      } catch (e: any) {
        if (alive) setError(e.message || "Failed to load count");
      }
    })();
    return () => { alive = false; };
  }, [weekId]);

  return { count, error };
}