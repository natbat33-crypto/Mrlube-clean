"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

export default function FixWeek2() {
  const [msg, setMsg] = useState("Ready to clean week2/tasks");

  async function run() {
    setMsg("Checking…");
    const col = collection(db, "modules", "week2", "tasks");
    const snap = await getDocs(col);

    // group by "order" and keep only the first doc per order (1..9)
    const byOrder = new Map<number, string[]>();
    snap.docs.forEach(d => {
      const o = (d.data() as any).order;
      if (typeof o === "number") {
        const list = byOrder.get(o) || [];
        list.push(d.id);
        byOrder.set(o, list);
      }
    });

    let deletes = 0;
    for (const [ord, ids] of byOrder.entries()) {
      // keep the first id, delete all others for that order
      const [, ...dupes] = ids;
      for (const id of dupes) {
        await deleteDoc(doc(db, "modules", "week2", "tasks", id));
        deletes++;
      }
    }

    setMsg(`✅ Done. Removed ${deletes} duplicate docs. Kept one doc per order 1..9.`);
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Fix Week 2 duplicates</h1>
      <p>{msg}</p>
      <button onClick={run} style={{ padding: "10px 14px", borderRadius: 8, border: "none", cursor: "pointer" }}>
        Clean week2/tasks
      </button>
    </main>
  );
}