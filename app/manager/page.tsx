"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

type Store = {
  number: number;
  name: string;
  address: string;
  managerUid?: string | null;
};

export default function ManagerDashboard() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- NEW STATE FOR THE TEST BLOCK ----
  const [testEmployees, setTestEmployees] = useState<any[]>([]);
  const [testTrainees, setTestTrainees] = useState<any[]>([]);
  const [testError, setTestError] = useState<string | null>(null);

  // SAFETY FILTER (prevents hydration crashes)
  const safe = (arr: any[]) =>
    Array.isArray(arr)
      ? arr.filter(
          (x) =>
            x &&
            typeof x === "object" &&
            typeof x.id === "string" &&
            typeof x.name === "string"
        )
      : [];

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      setStore(null);

      if (!u) {
        setUid(null);
        setStoreId(null);
        setLoading(false);
        return;
      }
      setUid(u.uid);

      // Prefer users/{uid}.storeId; fallback once to autoConnect()
      let sid: string | null = null;
      try {
        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const d = userSnap.data() as any;
          if (d?.storeId) sid = String(d.storeId);
        }
        if (!sid) {
          const { autoConnect } = await import("@/lib/autoConnect");
          const res = await autoConnect();
          if (res?.storeId) sid = String(res.storeId);
        }
      } catch {}

      setStoreId(sid);
      if (sid) {
        const snap = await getDoc(doc(db, "stores", sid));
        setStore(snap.exists() ? (snap.data() as Store) : null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // ---- TEST BLOCK: LOAD STORE PEOPLE DIRECTLY IN THE DASHBOARD ----
  useEffect(() => {
    if (!storeId) return;

    async function loadTestPeople() {
      try {
        const qEmployees = query(
          collection(db, "employees"),
          where("storeId", "==", storeId)
        );

        const res = await getDocs(qEmployees);

        const all: any[] = [];
        res.forEach((d) => all.push({ id: d.id, ...d.data() }));

        const safeAll = safe(all);

        setTestEmployees(safeAll.filter((x) => x.role === "employee"));
        setTestTrainees(safeAll.filter((x) => x.role === "trainee"));
      } catch (err) {
        console.error(err);
        setTestError("Failed to load store people.");
      }
    }

    loadTestPeople();
  }, [storeId]);

  // --- UI states ---
  if (!uid) {
    return (
      <main className="max-w-6xl mx-auto p-8">
        <h1 className="text-[22px] font-extrabold">Manager Dashboard</h1>
        <p className="text-gray-600 mt-1">Please sign in.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-8">
        <h1 className="text-[22px] font-extrabold">Manager Dashboard</h1>
        <p className="text-gray-600 mt-1">Loading…</p>
      </main>
    );
  }

  if (!storeId) {
    return (
      <main className="max-w-6xl mx-auto p-8">
        <h1 className="text-[22px] font-extrabold">Manager Dashboard</h1>
        <p className="text-gray-600 mt-1">No store assigned yet.</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-[22px] font-extrabold">Manager Dashboard</h1>
        <p className="text-gray-600">What you manage.</p>
      </div>

      {/* Store card */}
      {store && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-[15px] font-semibold">
                Store #{store.number}
              </div>
              <div className="text-sm text-gray-700">{store.name}</div>
              <div className="text-sm text-gray-700">{store.address}</div>
            </div>

            <Link
              href={`/manager/stores/${storeId}`}
              className="inline-flex h-9 items-center rounded-full border border-gray-300 px-3 text-sm text-gray-800 hover:bg-gray-50"
            >
              View store →
            </Link>
          </div>
        </section>
      )}

      {/* Notes tile */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <Link
          href={`/manager/notes?store=${storeId}`}
          className="grid grid-cols-[40px_1fr_auto] items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-gray-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9Z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Notes &amp; Messages</div>
            <div className="text-sm text-gray-600">Tap to view and send messages</div>
          </div>
          <span className="text-gray-500">→</span>
        </Link>
      </section>

      {/* ⭐ TEST BLOCK — rendering store employees & trainees DIRECTLY */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="font-bold mb-2">Store Staff (Test Block)</div>

        {testError && (
          <p className="text-red-600 mb-2">{testError}</p>
        )}

        <div className="text-sm">
          <div className="font-semibold">Trainees:</div>
          {testTrainees.length === 0 && <p className="text-gray-500">None</p>}
          {testTrainees.map((t) => (
            <div key={t.id} className="border p-3 rounded-lg my-2 bg-gray-50">
              {t.name} (trainee)
            </div>
          ))}

          <div className="font-semibold mt-4">Employees:</div>
          {testEmployees.length === 0 && <p className="text-gray-500">None</p>}
          {testEmployees.map((e) => (
            <div key={e.id} className="border p-3 rounded-lg my-2 bg-gray-50">
              {e.name} (employee)
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}


