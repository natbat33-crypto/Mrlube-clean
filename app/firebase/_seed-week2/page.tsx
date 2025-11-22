"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";

export default function SeedWeek2() {
  const [msg, setMsg] = useState("Click to seed Week 2");

  async function seed() {
    try {
      setMsg("Seeding…");

      // module doc (has week: 2 so the dashboard sees it)
      await setDoc(
        doc(db, "modules", "week2"),
        { title: "Week 2", order: 2, active: true, week: 2 },
        { merge: true }
      );

      const tasks = [
        "Plate number / VIN scan, and entering customer's information including their email address",
        "Mileage check, engine flush offer and service call with proper calls",
        "Study bay binders and the different codes/packages we offer",
        "Practice entering packages/codes while computer is in 'training mode'",
        "Shadow trainer, listening to recommendations",
        "Learn the basics about red bars and how to present them",
        "Present red bars to a minimum of 10 customers",
        "Cleaning floors, baystands, garbages, bathroom, etc.",
        "Complete Specialized Services online courses (at home)",
      ];

      // use deterministic IDs t01..t09 so reruns overwrite, not duplicate
      const colRef = collection(db, "modules", "week2", "tasks");
      for (let i = 0; i < tasks.length; i++) {
        const id = `t${String(i + 1).padStart(2, "0")}`; // t01..t09
        await setDoc(
          doc(colRef, id),
          { active: true, required: true, order: i + 1, title: tasks[i] },
          { merge: true }
        );
      }

      setMsg("✅ Week 2 seeded (idempotent) — safe to run anytime.");
    } catch (e: any) {
      setMsg(`❌ ${e.message || String(e)}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Seed Week 2</h1>
      <p>{msg}</p>
      <button onClick={seed} style={{ padding: "10px 14px", borderRadius: 8, border: "none", cursor: "pointer" }}>
        Seed Week 2 (doc + tasks)
      </button>
    </main>
  );
}