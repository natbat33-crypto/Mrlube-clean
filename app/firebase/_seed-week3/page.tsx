"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";

export default function SeedWeek3() {
  const [msg, setMsg] = useState("Click to seed Week 3");

  async function seed() {
    try {
      setMsg("Seeding…");

      // Ensure the module document exists (same shape as week1/week2)
      await setDoc(
        doc(db, "modules", "week3"),
        { title: "Week 3", week: 3, order: 3, active: true },
        { merge: true }
      );

      // Week 3 tasks (12)
      const tasks = [
        "Stand at computer! Greet customer and introduce team",
        "Open driver’s door and scan the VIN #",
        "Make proper call and enter customer’s KM’s",
        "Enter chosen package, confirming the price with the customer",
        "Enter in (or check) all customer information, including their email address",
        "Make recommendations using Red Bars",
        "Confirm all prices of any extra services before performing those services",
        "Complete invoice checklist, tech names & comments with accuracy",
        "Reset customer’s oil light, explain survey / Google on min 10 vehicles",
        "Ensure fleet vehicles are understood and how to enter correctly",
        "Trainer shadows trainee who’s doing pos #1 on min 10 vehicles",
        "Complete Master Tech online training course (at home)",
      ];

      // Deterministic doc IDs t01..t12 → idempotent (safe to click multiple times)
      const colRef = collection(db, "modules", "week3", "tasks");
      for (let i = 0; i < tasks.length; i++) {
        const id = `t${String(i + 1).padStart(2, "0")}`; // t01..t12
        await setDoc(
          doc(colRef, id),
          {
            title: tasks[i],
            order: i + 1,
            required: true,
            active: true,
            // done is optional; dashboard counts it if you later toggle it
          },
          { merge: true }
        );
      }

      setMsg("✅ Week 3 seeded (idempotent) — safe to run anytime.");
    } catch (e: any) {
      setMsg(`❌ ${e.message || String(e)}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Seed Week 3</h1>
      <p>{msg}</p>
      <button
        onClick={seed}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
        }}
      >
        Seed Week 3 (doc + tasks)
      </button>
    </main>
  );
}