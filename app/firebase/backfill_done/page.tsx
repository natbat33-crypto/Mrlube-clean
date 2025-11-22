// app/firebase/backfill-done/page.tsx
"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

export default function BackfillDone() {
  const [msg, setMsg] = useState("Running…");
  useEffect(() => {
    (async () => {
      let fixed = 0;
      const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
      for (const d of snap.docs) {
        const data = d.data() as any;
        if (typeof data.done !== "boolean") {
          await updateDoc(doc(db, "days", "day-1", "tasks", d.id), { done: false });
          fixed++;
        }
      }
      setMsg(`OK — ensured 'done' on ${snap.size} tasks (fixed ${fixed}).`);
    })().catch(e => setMsg(String(e)));
  }, []);
  return <pre style={{padding:16}}>{msg}</pre>;
}