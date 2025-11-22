"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, setDoc } from "firebase/firestore";

export default function SeedDay1() {
  const [msg, setMsg] = useState("Click to seed Day 1");

  async function seed() {
    try {
      setMsg("Seeding…");

      // 1) ensure /days/day-1 exists
      await setDoc(doc(db, "days", "day-1"), {
        title: "Day 1 - Safety Fundamentals",
        order: 1,
      }, { merge: true });

      // 2) write 6 tasks under /days/day-1/tasks
      const tasks = [
        { title: "Complete Hiring Kit with manager/trainer", sort_order: 1 },
        { title: "WHMIS 2015 online course", sort_order: 2 },
        { title: "Work Safe Module - Technician online course", sort_order: 3 },
        { title: "FS Orientation online course", sort_order: 4 },
        { title: "FS Upper Technician online course", sort_order: 5 },
        { title: "FS Lower Technician online course", sort_order: 6 },
      ];

      const colRef = collection(db, "days", "day-1", "tasks");
      const snap = await getDocs(colRef);
      if (snap.empty) {
        for (const t of tasks) await addDoc(colRef, t);
        setMsg("✅ Seeded 6 tasks under days/day-1/tasks");
      } else {
        setMsg(`Already had ${snap.size} tasks under days/day-1/tasks`);
      }
    } catch (e:any) {
      setMsg(`❌ ${e.message || String(e)}`);
    }
  }

  return (
    <main style={{padding:24,fontFamily:"system-ui"}}>
      <h1>Seed Day 1</h1>
      <p>{msg}</p>
      <button onClick={seed} style={{padding:"10px 14px",borderRadius:8,border:"none",cursor:"pointer"}}>
        Seed Day 1 (doc + tasks)
      </button>
    </main>
  );
}