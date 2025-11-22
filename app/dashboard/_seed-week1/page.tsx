"use client";
import { useState } from "react";
import { db } from "@/lib/firebase";
import { setDoc, doc, collection, getDocs, deleteDoc } from "firebase/firestore";

const MODULE_ID = "week1"; // writes to modules/week1/tasks

// Week 1 — Steps to a Perfect Service (14 items)
const TASKS = [
  { id: "t01-greet-offer-beverages", title: "Greet customer and offer coffee, water & newspaper", order: 1 },
  { id: "t02-wash-windshield-back-window", title: "Wash windshield and back window", order: 2 },
  { id: "t03-pop-hood-check-oil-remove-cap", title: "Pop the hood, check oil level on dipstick and remove oil filler cap", order: 3 },
  { id: "t04-check-tire-pressures-tread", title: "Check tire pressures (door placard) & call out tread depths", order: 4 },
  { id: "t05-lubricate-door-hinges", title: "Lubricate front and rear door hinges (both from the front door)", order: 5 },
  { id: "t06-fluid-top-ups-proper-calls", title: "Fluid top-ups with proper calls", order: 6 },
  { id: "t07-underhood-checks-proper-calls", title: "Underhood checks with proper calls", order: 7 },
  { id: "t08-add-proper-oil-proper-calls", title: "Add proper grade and amount of oil with proper calls", order: 8 },
  { id: "t09-restart-check-lights-proper-calls", title: "Restart the vehicle and check all lights with proper calls", order: 9 },
  { id: "t10-check-rpms-filters-proper-calls", title: "Check RPMs (upper tech checks upstairs filters) with proper calls", order: 10 },
  { id: "t11-courtesy-double-checks-proper-calls", title: "Courtesy double checks and inspections with proper calls", order: 11 },
  { id: "t12-show-dipstick-brand-grade-amount", title: "Show oil dipstick to customer stating brand, grade and amount of oil used", order: 12 },
  { id: "t13-double-check-close-wipe-hood", title: "Double check everything tight, no loose tools, close the hood & wipe hood", order: 13 },
  { id: "t14-start-specialized-services-online-optional", title: "Start Specialized Services online courses (at home) (optional)", order: 14 },
];

export default function SeedWeek1() {
  const [msg, setMsg] = useState("Ready.");

  async function seed() {
    try {
      setMsg("Wiping old Week 1 tasks…");

      // ensure module doc exists
      await setDoc(
        doc(db, "modules", MODULE_ID),
        { title: "Week 1", week: 1, order: 1, active: true },
        { merge: true }
      );

      // delete existing tasks
      const existing = await getDocs(collection(db, "modules", MODULE_ID, "tasks"));
      for (const d of existing.docs) {
        await deleteDoc(doc(db, "modules", MODULE_ID, "tasks", d.id));
      }

      setMsg("Seeding new Week 1 tasks…");

      // write the 14-step list
      for (const t of TASKS) {
        await setDoc(
          doc(db, "modules", MODULE_ID, "tasks", t.id),
          {
            title: t.title,
            order: t.order,
            required: true,
            done: false,
            active: true,
            moduleId: MODULE_ID,
          },
          { merge: true }
        );
      }

      setMsg(`✅ Replaced with ${TASKS.length} Week-1 tasks under modules/${MODULE_ID}/tasks`);
    } catch (e: any) {
      setMsg("❌ " + (e?.message ?? String(e)));
    }
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Seed Week 1 (replace)</h1>
      <button onClick={seed} style={{ padding: "8px 14px", border: "1px solid #ccc", borderRadius: 8 }}>
        Replace Week 1 Tasks
      </button>
      <p style={{ marginTop: 12 }}>{msg}</p>
    </main>
  );
}