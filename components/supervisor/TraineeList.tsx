// components/supervisor/TraineeList.tsx
"use client";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, onSnapshot, query, where, doc, getDoc } from "firebase/firestore";

type Trainee = { id: string; name?: string; storeId: string; supervisorId?: string|null };

export default function TraineeList() {
  const [rows, setRows] = useState<Trainee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: any;
    (async () => {
      const u = auth.currentUser;
      if (!u) { setRows([]); setLoading(false); return; }

      // get supervisor's storeId
      const me = await getDoc(doc(db, "users", u.uid));
      const storeId = me.exists() ? (me.data() as any).storeId : null;
      if (!storeId) { setRows([]); setLoading(false); return; }

      // live query: trainees in same store, assigned to THIS supervisor
      const qy = query(
        collection(db, "trainees"),
        where("storeId", "==", storeId),
        where("supervisorId", "==", u.uid)
      );

      unsub = onSnapshot(qy, (snap) => {
        setRows(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      }, (e) => { console.error("TraineeList err", e); setLoading(false); });
    })();

    return () => unsub && unsub();
  }, []);

  if (loading) return <div className="p-3">Loading trainees…</div>;
  if (rows.length === 0) return <div className="p-3">No trainees assigned to you yet.</div>;
  return (
    <div className="p-3 space-y-2">
      {rows.map(t => <div key={t.id} className="border p-2 rounded">{t.name ?? t.id}</div>)}
    </div>
  );
}
