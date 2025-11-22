"use client";

import { useEffect, useState } from "react";
import { getApp } from "firebase/app";
import { db } from "@/lib/firebase";
import {
  collection,
  collectionGroup,
  getDocs,
} from "firebase/firestore";

export default function Probe() {
  const [out, setOut] = useState<string>("Running…");

  useEffect(() => {
    (async () => {
      try {
        const projectId = getApp().options.projectId as string;

        // 1) How many 'days' docs?
        const daysSnap = await getDocs(collection(db, "days"));
        const dayIds = daysSnap.docs.map(d => d.id);

        // 2) How many 'tasks' anywhere (collectionGroup)?
        const cgSnap = await getDocs(collectionGroup(db, "tasks"));
        const firstTask = cgSnap.docs[0]?.id;

        // 3) How many under days/day-1/tasks?
        const d1Snap = await getDocs(collection(db, "days", "day-1", "tasks"));
        const d1Count = d1Snap.size;
        const d1First = d1Snap.docs[0]?.id;

        setOut([
          `projectId: ${projectId}`,
          `days count: ${daysSnap.size} [${dayIds.join(", ")}]`,
          `collectionGroup('tasks') count: ${cgSnap.size} (first: ${firstTask ?? "none"})`,
          `days/day-1/tasks count: ${d1Count} (first: ${d1First ?? "none"})`,
        ].join("\n"));
      } catch (e: any) {
        setOut(`ERROR: ${e.message || String(e)}`);
      }
    })();
  }, []);

  return <pre style={{ padding:16, whiteSpace:"pre-wrap" }}>{out}</pre>;
}