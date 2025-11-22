"use client";

import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function FirestoreRead() {
  const [status, setStatus] = useState("Loading…");
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "pings"));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setRows(data);
        setStatus(`OK: got ${data.length} doc(s)`);
      } catch (e: any) {
        setStatus(`ERROR: ${e.message || String(e)}`);
      }
    })();
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Firestore Read</h1>
      <p>{status}</p>
      <pre style={{ background: "#f6f6f6", padding: 12 }}>
        {JSON.stringify(rows, null, 2)}
      </pre>
    </main>
  );
}
