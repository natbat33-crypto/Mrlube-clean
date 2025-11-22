"use client";

import { useState } from "react";
import { db } from "../../../lib/firebase";
import { collection, addDoc, getDocs } from "firebase/firestore";

export default function FirestoreWrite() {
  const [status, setStatus] = useState("Click the button to add a ping");
  const [rows, setRows] = useState<any[]>([]);

  async function addPing() {
    try {
      setStatus("Writing…");
      await addDoc(collection(db, "pings"), { text: "ping from app", ts: Date.now() });
      const snap = await getDocs(collection(db, "pings"));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRows(data);
      setStatus(`OK: total docs = ${data.length}`);
    } catch (e: any) {
      setStatus(`ERROR: ${e.message || String(e)}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Firestore Write</h1>
      <p>{status}</p>
      <button onClick={addPing}>Add ping</button>
      <pre style={{ background: "#f6f6f6", padding: 12, marginTop: 12 }}>
        {JSON.stringify(rows, null, 2)}
      </pre>
    </main>
  );
}
