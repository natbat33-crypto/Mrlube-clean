// app/manager/stores/[storeId]/RosterDebug.tsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

type Emp = { uid: string; storeId: string; role: string; active: boolean; name?: string };

export default function RosterDebug({ storeId }: { storeId: string }) {
  const [rows, setRows] = useState<Emp[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "stores", String(storeId), "employees"));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as any[];
        const clean: Emp[] = list
          .filter(e => e && e.storeId === String(storeId))
          .map(e => ({
            uid: e.uid, storeId: e.storeId, role: String(e.role || "").toLowerCase(), active: !!e.active, name: e.name
          }));
        if (alive) setRows(clean);
      } catch (e: any) {
        if (alive) setErr(e.message ?? String(e));
      }
    })();
    return () => { alive = false; };
  }, [storeId]);

  const mgr = rows.filter(r => r.active && r.role === "manager");
  const sup = rows.filter(r => r.active && r.role === "supervisor");
  const tra = rows.filter(r => r.active && r.role === "trainee");

  return (
    <div style={{
      position: "fixed", right: 12, top: 12, zIndex: 50,
      background: "rgba(0,0,0,0.75)", color: "#fff",
      padding: "10px 12px", borderRadius: 10, fontSize: 12, maxWidth: 360
    }}>
      <div style={{fontWeight:700, marginBottom:6}}>Roster Debug (store {storeId})</div>
      {err ? <div style={{color:"#ffd966"}}>Error: {err}</div> : null}
      <div>managers: {mgr.length} {mgr.map(m => `• ${m.name ?? m.uid}`).join("  ")}</div>
      <div>supervisors: {sup.length} {sup.map(m => `• ${m.name ?? m.uid}`).join("  ")}</div>
      <div>trainees: {tra.length} {tra.map(m => `• ${m.name ?? m.uid}`).join("  ")}</div>
      <div style={{opacity:0.8, marginTop:6}}>total employees: {rows.length}</div>
    </div>
  );
}
