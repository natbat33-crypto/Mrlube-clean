// app/health/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc, getDoc, collection, getDocs, collectionGroup, query, where,
  serverTimestamp, setDoc
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Row = { name: string; status: "PASS" | "FAIL"; detail?: string };

export default function HealthPage() {
  const [rows, setRows] = useState<Row[]>([
    { name: "Auth", status: "FAIL" },
    { name: "Project ID", status: "FAIL" },
    { name: "users/{uid} readable", status: "FAIL" },
    { name: "users/{uid} writable (cache)", status: "FAIL" },
    { name: "stores exists", status: "FAIL" },
    { name: "employees CG (uid+active)", status: "FAIL" },
    { name: "employees direct doc (by id)", status: "FAIL" },
  ]);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);

  useEffect(() => {
    (async () => {
      const next: Row[] = [];

      // Auth
      try {
        const u = auth.currentUser;
        if (!u) throw new Error("not signed in");
        const idt = await u.getIdToken(true);
        next.push({ name: "Auth", status: "PASS", detail: `uid=${u.uid}, token=${idt ? "ok" : "missing"}` });
      } catch (e: any) {
        next.push({ name: "Auth", status: "FAIL", detail: e?.message || String(e) });
      }

      // Project ID (read from initialized db)
      try {
        const pid = String(((db as any).app?.options?.projectId) || "unknown");
        next.push({ name: "Project ID", status: pid && pid !== "unknown" ? "PASS" : "FAIL", detail: pid });
      } catch (e: any) {
        next.push({ name: "Project ID", status: "FAIL", detail: e?.message || String(e) });
      }

      // users/{uid} readable
      try {
        if (!uid) throw new Error("no uid");
        const snap = await getDoc(doc(db, "users", uid));
        next.push({
          name: "users/{uid} readable",
          status: "PASS",
          detail: snap.exists() ? JSON.stringify(snap.data()).slice(0, 180) : "doc missing (ok)",
        });
      } catch (e: any) {
        next.push({ name: "users/{uid} readable", status: "FAIL", detail: e?.message || String(e) });
      }

      // users/{uid} writable (cache)
      try {
        if (!uid) throw new Error("no uid");
        await setDoc(doc(db, "users", uid), { pingAt: serverTimestamp() }, { merge: true });
        next.push({ name: "users/{uid} writable (cache)", status: "PASS", detail: "set pingAt ok" });
      } catch (e: any) {
        next.push({ name: "users/{uid} writable (cache)", status: "FAIL", detail: e?.message || String(e) });
      }

      // stores exists
      try {
        const s = await getDocs(collection(db, "stores"));
        next.push({ name: "stores exists", status: s.size >= 1 ? "PASS" : "FAIL", detail: `count=${s.size}` });
      } catch (e: any) {
        next.push({ name: "stores exists", status: "FAIL", detail: e?.message || String(e) });
      }

      // employees collection-group (uid + active == true)
      try {
        if (!uid) throw new Error("no uid");
        const cg = collectionGroup(db, "employees");
        const qy = query(cg, where("uid", "==", uid), where("active", "==", true));
        const r = await getDocs(qy);
        if (!r.empty) {
          const hit = r.docs[0];
          const storeId = hit.ref.parent.parent?.id || "(unknown)";
          const role = (hit.data() as any)?.role || "(none)";
          next.push({ name: "employees CG (uid+active)", status: "PASS", detail: `store=${storeId}, role=${role}` });
        } else {
          next.push({ name: "employees CG (uid+active)", status: "FAIL", detail: "no match" });
        }
      } catch (e: any) {
        next.push({ name: "employees CG (uid+active)", status: "FAIL", detail: e?.message || String(e) });
      }

      // employees direct doc by id
      try {
        if (!uid) throw new Error("no uid");
        const s = await getDocs(collection(db, "stores"));
        let found: null | { storeId: string; role?: string; active?: any } = null;
        for (const d of s.docs.slice(0, 50)) {
          const eRef = doc(db, "stores", d.id, "employees", uid);
          const eSnap = await getDoc(eRef);
          if (eSnap.exists()) {
            const data = eSnap.data() as any;
            found = { storeId: d.id, role: data?.role, active: data?.active };
            break;
          }
        }
        next.push(
          found
            ? { name: "employees direct doc (by id)", status: "PASS", detail: `store=${found.storeId}, role=${found.role || "(none)"}, active=${String(found.active)}` }
            : { name: "employees direct doc (by id)", status: "FAIL", detail: "not found in first 50 stores" }
        );
      } catch (e: any) {
        next.push({ name: "employees direct doc (by id)", status: "FAIL", detail: e?.message || String(e) });
      }

      setRows(next);
    })();
  }, [uid]);

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif", maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>Production Health Check</h1>
      <p style={{ marginTop: 6, color: "#475569" }}>
        Sign in, then refresh this page. This shows exactly what the live app can read/write.
      </p>
      <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>Check</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>Status</th>
              <th style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #e5e7eb" }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>{r.name}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9", fontWeight: 700, color: r.status === "PASS" ? "#16a34a" : "#dc2626" }}>
                  {r.status}
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #f1f5f9" }}>
                  <code style={{ whiteSpace: "pre-wrap" }}>{r.detail || ""}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 12, color: "#64748b" }}>
        This page doesn’t change any data except writing <code>pingAt</code> on your user doc to confirm write access.
      </p>
    </main>
  );
}
