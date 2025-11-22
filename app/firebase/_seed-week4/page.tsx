// app/firebase/seed-week4/page.tsx
"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";

export default function SeedWeek4() {
  const [msg, setMsg] = useState("Click to seed Week 4");

  async function seed() {
    try {
      setMsg("Seeding…");

      // Create/merge the module doc
      await setDoc(
        doc(db, "modules", "week4"),
        { title: "Week 4", order: 4, active: true, week: 4 },
        { merge: true }
      );

      // --- Tasks (deterministic IDs: t01..t04) ---
      const tasks = [
        {
          id: "t01",
          order: 1,
          title: "TIA Basic & TIA TPMS online courses (at home)",
          description:
            "Complete the TIA Basic and TIA TPMS online training at home.",
          required: true,
          timed: false,
          type: "COURSE",
        },
        {
          id: "t02",
          order: 2,
          title:
            "TRS Time: Perform all steps from positions 1 & 3 (≤ 15 min, plate #5)",
          description:
            "Complete all steps from positions 1 and 3 in fifteen minutes or less (plate #5).",
          required: true,
          timed: true,
          targetMinutes: 15,
          type: "TRS",
        },
        {
          id: "t03",
          order: 3,
          title:
            "TR Time: Tire rotation, tire swap, and tire balance (record # of services)",
          description:
            "Perform a tire rotation, tire swap, and tire balance. Record number of services completed.",
          required: true,
          timed: true,
          // adjust if you get a firm target; placeholder is 20
          targetMinutes: 20,
          type: "TR",
        },
        {
          id: "t04",
          order: 4,
          title: "TCS Time (1 tire)",
          description:
            "Perform a 1-tire change (TCS). Record time and outcome.",
          required: true,
          timed: true,
          // adjust if needed; common benchmark is ~5 minutes
          targetMinutes: 5,
          type: "TCS",
        },
      ] as const;

      const colRef = collection(db, "modules", "week4", "tasks");
      for (const t of tasks) {
        await setDoc(
          doc(colRef, t.id),
          {
            active: true,
            required: t.required,
            timed: t.timed,
            order: t.order,
            title: t.title,
            description: t.description,
            type: t.type,
            ...(t.timed ? { targetMinutes: t.targetMinutes } : {}),
            // done is omitted initially; trainee will set it later
          },
          { merge: true }
        );
      }

      setMsg("✅ Week 4 seeded (idempotent) — safe to run anytime.");
    } catch (e: any) {
      setMsg(`❌ ${e.message || String(e)}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Seed Week 4</h1>
      <p>{msg}</p>
      <button
        onClick={seed}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          background: "#0b3d91",
          color: "white",
          fontWeight: 600,
        }}
      >
        Seed Week 4 (doc + tasks)
      </button>
      <p style={{ marginTop: 12, color: "#444" }}>
        Creates <code>modules/week4</code> and <code>tasks/t01…t04</code> with fixed IDs.
      </p>
    </main>
  );
}