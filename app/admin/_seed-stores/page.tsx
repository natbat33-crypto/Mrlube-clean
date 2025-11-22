// app/admin/seed-stores/page.tsx
"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export default function SeedStoresPage() {
  const [msg, setMsg] = useState("Click to seed Stores");
  const [busy, setBusy] = useState(false);

  async function seed() {
    if (busy) return;
    setBusy(true);
    setMsg("Seeding…");

    try {
      // quick ping to confirm Firestore writes from the browser
      await setDoc(doc(db, "__ping", "ok"), { t: Date.now() }, { merge: true });

      const stores = [
        { id: "24",  number: 24,  name: "Husaro Enterprises Ltd", address: "1076 Nairn Avenue, Winnipeg, MB",           managerUid: null, managerEmail: null },
        { id: "26",  number: 26,  name: "Husaro Enterprises Ltd", address: "640 St. James Street, Winnipeg, MB",        managerUid: null, managerEmail: null },
        { id: "46",  number: 46,  name: "Husaro Enterprises Ltd", address: "232 St. Anne's Road, Winnipeg, MB",         managerUid: null, managerEmail: null },
        { id: "163", number: 163, name: "Husaro Enterprises Ltd", address: "686 Sterling Lyon Parkway, Winnipeg, MB",   managerUid: null, managerEmail: null },
        { id: "276", number: 276, name: "Tazcor - 4398158 Manitoba Ltd", address: "Unit 500-50 Sage Creek Blvd, Winnipeg, MB", managerUid: null, managerEmail: null },
        { id: "298", number: 298, name: "Tazcor - 4398158 Manitoba Ltd", address: "1311 Henderson Highway, Winnipeg, MB",      managerUid: null, managerEmail: null },
      ];

      for (const s of stores) {
        await setDoc(
          doc(db, "stores", s.id),
          {
            number: s.number,
            name: s.name,
            address: s.address,
            managerUid: s.managerUid,
            managerEmail: s.managerEmail,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      }

      setMsg("✅ Stores seeded. Go back to /admin to see them.");
    } catch (e: any) {
      setMsg(`❌ ${e?.message || String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Seed Stores</h1>
      <p style={{ marginTop: 8 }}>{msg}</p>
      <button
        onClick={seed}
        disabled={busy}
        style={{
          marginTop: 12, padding: "10px 14px",
          borderRadius: 9999, border: "1px solid #d1d5db",
          background: busy ? "#f3f4f6" : "white",
          cursor: busy ? "not-allowed" : "pointer", fontWeight: 600
        }}
      >
        {busy ? "Seeding…" : "Seed Stores"}
      </button>
      <p style={{ marginTop: 12, color: "#444" }}>
        Creates/merges <code>stores/24, 26, 46, 163, 276, 298</code>.
      </p>
    </main>
  );
}