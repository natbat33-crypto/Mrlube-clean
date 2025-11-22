"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../../../../lib/firebase"; // ← single correct import

export default function Training() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, "tasks"), orderBy("sort_order", "asc"));
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
        setRows(data);
        setErr("");
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 680, margin: "24px auto", fontFamily: "system-ui" }}>
      <h1>Week 1 Day 1 (live)</h1>
      {err && <p style={{ color: "red" }}>Error: {err}</p>}
      {!err && rows.length === 0 && <p>No tasks yet. ⭕</p>}
      <ol>
        {rows.map((t, i) => (
          <li key={t.id ?? i}>{t.title}</li>
        ))}
      </ol>
    </div>
  );
}