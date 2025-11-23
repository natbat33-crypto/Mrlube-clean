"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";

import { autoConnect } from "@/lib/autoConnect";

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

      let sid: string | null = null;

      try {
        // --- 1) users/{uid}
        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const d = userSnap.data() as any;
          if (d?.storeId) sid = String(d.storeId);
        }

        // --- 2) fallback: autoConnect()
        if (!sid) {
          const res = await autoConnect();
          if (res?.storeId) sid = String(res.storeId);
        }

        // --- ⭐ 3) FINAL FIX: scan employees table
        if (!sid) {
          try {
            const storesSnap = await getDocs(collection(db, "stores"));
            for (const s of storesSnap.docs) {
              const empSnap = await getDocs(
                collection(db, "stores", s.id, "employees")
              );
              const found = empSnap.docs.find((e) => {
                const d = e.data() as any;
                return d.uid === u.uid && d.active !== false;
              });
              if (found) {
                sid = s.id;
                break;
              }
            }
          } catch (err) {
            console.error("employees scan failed:", err);
          }
        }
      } catch (err) {
        /* ignore */
      }

      setStoreId(sid);

      // --- Load store data safely
      if (sid) {
        const storeRef = doc(db, "stores", sid);
        let storeData: Store | null = null;

        try {
          const root = await getDoc(storeRef);

          if (root.exists()) {
            storeData = root.data() as Store;
          } else {
            // fallback: build store from employees
            const empColl = collection(db, "stores", sid, "employees");
            const empDocs = await getDocs(empColl);

            if (!empDocs.empty) {
              storeData = {
                number: Number(sid),
                name: `Store #${sid}`,
                address: "N/A",
              };
            }
          }
        } catch {
          storeData = null;
        }

        setStore(storeData);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* ---------- UI STATES ---------- */

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

  /* ---------- MAIN DASHBOARD ---------- */

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-[22px] font-extrabold">Manager Dashboard</h1>
        <p className="text-gray-600">What you manage.</p>
      </header>

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
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a 4 4 0 0 1 4 4v9Z" />
            </svg>
          </div>

          <div>
            <div className="font-semibold text-gray-900">
              Notes & Messages
            </div>
            <div className="text-sm text-gray-600">
              Tap to view and send messages
            </div>
          </div>

          <span className="text-gray-500">→</span>
        </Link>
      </section>
    </main>
  );
}





