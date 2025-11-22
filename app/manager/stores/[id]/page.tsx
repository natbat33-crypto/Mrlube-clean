"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

export default function ManagerStorePage() {
  const params = useParams();
  const storeId = String(params?.id || "");

  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => unsub();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        if (!storeId || !uid) return;

        const employeesRef = collection(db, "stores", storeId, "employees");
        const active = query(employeesRef, where("active", "==", true));
        const snap = await getDocs(active);

        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setDebug({
          storeId,
          uid,
          employeesFound: list.length,
          employees: list,
        });

      } catch (err: any) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [storeId, uid]);

  // ███ DEBUG DISPLAY (white screen killer)
  if (loading)
    return (
      <div className="p-6 text-sm">
        <b>Loading store page…</b>
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-red-600 text-sm whitespace-pre-wrap">
        <h2 className="font-bold">Store Page Error:</h2>
        {error}
        <pre>{JSON.stringify(debug, null, 2)}</pre>
      </div>
    );

  if (!debug)
    return (
      <div className="p-6 text-sm">
        <b>No debug data loaded.</b>
      </div>
    );

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-xl font-bold">Store {storeId}</h1>

      <pre className="text-xs bg-gray-100 p-3 rounded">
        {JSON.stringify(debug, null, 2)}
      </pre>

      <Link href="/manager" className="text-blue-600 underline">
        ← Back to Dashboard
      </Link>
    </main>
  );
}
