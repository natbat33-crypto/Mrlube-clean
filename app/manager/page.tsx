"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

export default function ManagerDashboard() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Staff data
  const [trainees, setTrainees] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  // Collapsible toggle
  const [openStaff, setOpenStaff] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (!u) {
        setUid(null);
        setStoreId(null);
        setStore(null);
        return setLoading(false);
      }

      setUid(u.uid);

      // try user doc
      let sid: string | null = null;
      try {
        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const d = userSnap.data() as any;
          if (d?.storeId) sid = String(d.storeId);
        }

        // fallback autoConnect
        if (!sid) {
          const { autoConnect } = await import("@/lib/autoConnect");
          const res = await autoConnect();
          if (res?.storeId) sid = String(res.storeId);
        }
      } catch {}

      setStoreId(sid);

      if (sid) {
        const snap = await getDoc(doc(db, "stores", sid));
        setStore(snap.exists() ? snap.data() : null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Load staff when storeId arrives
  useEffect(() => {
    if (!storeId) return;

    async function loadPeople() {
      setStaffLoading(true);

      const qPeople = query(
        collection(db, "employees"),
        where("storeId", "==", storeId)
      );
      const res = await getDocs(qPeople);

      const all: any[] = [];
      res.forEach((d) => all.push({ id: d.id, ...d.data() }));

      setEmployees(all.filter((p) => p.role === "employee"));
      setTrainees(all.filter((p) => p.role === "trainee"));

      setStaffLoading(false);
    }

    loadPeople();
  }, [storeId]);

  // ---------------------------------------------------------------------

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

  // ---------------------------------------------------------------------

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-[22px] font-extrabold">Manager Dashboard</h1>
        <p className="text-gray-600">What you manage.</p>
      </div>

      {/* Assigned store */}
      {store && (
        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-[15px] font-semibold">Store #{store.number}</div>
              <div className="text-sm text-gray-700">{store.name}</div>
              <div className="text-sm text-gray-700">{store.address}</div>
            </div>

            <button
              disabled
              className="inline-flex h-9 items-center rounded-full border border-gray-300 px-3 text-sm text-gray-400 cursor-default"
            >
              View store →
            </button>
          </div>
        </section>
      )}

      {/* Notes link */}
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
            <div className="font-semibold text-gray-900">Notes & Messages</div>
            <div className="text-sm text-gray-600">Tap to view and send messages</div>
          </div>
          <span className="text-gray-500">→</span>
        </Link>
      </section>

      {/* Store Staff — collapsible */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">

        <button
          onClick={() => setOpenStaff(!openStaff)}
          className="grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 text-left"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-gray-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm-7 9a7 7 0 0 1 14 0Z" />
            </svg>
          </div>

          <div>
            <div className="font-semibold text-gray-900">Store Staff</div>
            <div className="text-sm text-gray-600">
              Trainees & employees assigned to your store
            </div>
          </div>

          <span className="text-gray-500">{openStaff ? "▲" : "▼"}</span>
        </button>

        {/* Collapsible content */}
        {openStaff && (
          <div className="mt-5 space-y-8">

            {/* Trainees */}
            <div>
              <h2 className="font-semibold mb-2">Trainees</h2>
              {staffLoading && <p className="text-sm text-gray-500">Loading…</p>}
              {!staffLoading && trainees.length === 0 && (
                <p className="text-sm text-gray-500">No trainees found.</p>
              )}

              <div className="space-y-3">
                {trainees.map((t) => (
                  <div key={t.id} className="border p-4 rounded-lg bg-gray-50">
                    <div className="font-semibold">{t.name}</div>
                    <Link
                      href={`/supervisor/${t.id}`}
                      className="text-blue-600 underline text-sm"
                    >
                      View trainee progress
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Employees */}
            <div>
              <h2 className="font-semibold mb-2">Employees</h2>
              {staffLoading && <p className="text-sm text-gray-500">Loading…</p>}
              {!staffLoading && employees.length === 0 && (
                <p className="text-sm text-gray-500">No employees found.</p>
              )}

              <div className="space-y-3">
                {employees.map((e) => (
                  <div key={e.id} className="border p-4 rounded-lg bg-gray-50">
                    <div className="font-semibold">{e.name}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </section>
    </main>
  );
}


