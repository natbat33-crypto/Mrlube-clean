//app manager page
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
  storeId?: string;
};

export default function ManagerDashboard() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  // ---------------------------
  // AUTH
  // ---------------------------
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
        // 1) users/{uid}
        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const d = userSnap.data() as any;
          if (d?.storeId) sid = String(d.storeId);
        }

        // 2) autoConnect fallback
        if (!sid) {
          const res = await autoConnect();
          if (res?.storeId) sid = String(res.storeId);
        }

        // ---------------------------
        // 3) FINAL RESCUE: scan store employees
        // ---------------------------
        if (!sid) {
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
        }
      } catch (err) {
        console.error("storeId detection error:", err);
      }

      setStoreId(sid);

      // ---------------------------
      // LOAD STORE DATA
      // ---------------------------
      if (sid) {
        try {
          const storeSnap = await getDoc(doc(db, "stores", sid));
          if (storeSnap.exists()) {
            setStore(storeSnap.data() as Store);
          } else {
            setStore({
              number: Number(sid),
              name: `Store #${sid}`,
              address: "N/A",
              storeId: sid,
            });
          }
        } catch (err) {
          console.error("store load error:", err);
        }
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  // ---------------------------
  // UI STATES
  // ---------------------------
  if (!uid) {
    return (
      <main className="max-w-6xl mx-auto p-8">
        <h1>Manager Dashboard</h1>
        <p>Please sign in.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-8">
        <h1>Manager Dashboard</h1>
        <p>Loading…</p>
      </main>
    );
  }

  if (!storeId) {
    return (
      <main className="max-w-6xl mx-auto p-8">
        <h1>Manager Dashboard</h1>
        <p>No store assigned yet.</p>
      </main>
    );
  }

  // ---------------------------
  // MAIN UI
  // ---------------------------
  return (
    <main className="max-w-6xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-[22px] font-extrabold">Manager Dashboard</h1>
        <p className="text-gray-600">What you manage.</p>

        {/* DEBUG - remove anytime */}
        <p className="text-xs text-red-600 mt-2">
          DEBUG storeId = {String(storeId)}
        </p>
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

            {/* ⭐ FIXED: ENSURES CORRECT WORKING LINK */}
            <Link
              href={`/manager/stores/${storeId}`}
              className="inline-flex h-9 items-center rounded-full border border-gray-300 px-3 text-sm text-gray-800 hover:bg-gray-50"
            >
              View store →
            </Link>
          </div>
        </section>
      )}

      {/* Notes */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <Link
          href={`/manager/notes?store=${storeId}`}
          className="grid grid-cols-[40px_1fr_auto] items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white"></div>

          <div>
            <div className="font-semibold text-gray-900">Notes & Messages</div>
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


