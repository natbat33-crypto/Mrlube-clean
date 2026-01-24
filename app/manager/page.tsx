"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";

/* ---------------- types ---------------- */
type Emp = {
  uid: string;
  role?: string;
  name?: string;
  email?: string;
  active?: boolean;
  supervisor?: string;
  trainer?: string;
};

type Store = {
  number: number;
  name: string;
  address: string;
};

/* ---------------- task helpers ---------------- */
async function loadAllRealTasks(): Promise<string[]> {
  const result: string[] = [];

  async function addTasks(parent: string, week: string, sub: string) {
    const snap = await getDocs(collection(db, parent, week, sub));
    snap.forEach((d) => {
      result.push(`${parent}__${week}__${sub}__${d.id}`);
    });
  }

  await addTasks("days", "day-1", "tasks");
  await addTasks("modules", "week1", "tasks");
  await addTasks("modules", "week2", "tasks");
  await addTasks("modules", "week3", "tasks");
  await addTasks("modules", "week4", "tasks");

  return result;
}

/* ===========================================================
   MANAGER + GM DASHBOARD
=========================================================== */
export default function ManagerDashboard() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  const [role, setRole] = useState<string | null>(null); // ⭐ NEW

  const [trainees, setTrainees] = useState<Emp[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  /* ---------- auth ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (!u) {
        setUid(null);
        setStoreId(null);
        setRole(null);
        setLoading(false);
        return;
      }

      setUid(u.uid);

      const userSnap = await getDoc(doc(db, "users", u.uid));
      if (userSnap.exists()) {
        const d: any = userSnap.data();
        setStoreId(d.storeId || null);
        setRole((d.role || "").toLowerCase()); // ⭐ NEW
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* ---------- load store ---------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const snap = await getDoc(doc(db, "stores", storeId));
      if (snap.exists()) setStore(snap.data() as Store);
    })();
  }, [storeId]);

  /* ---------- load staff ---------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const snap = await getDocs(
        query(
          collection(db, "stores", storeId, "employees"),
          where("active", "==", true)
        )
      );

      const list = snap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as any),
      }));

      setTrainees(list.filter((e) => e.role === "trainee"));
      setEmployees(list.filter((e) => e.role !== "trainee"));
    })();
  }, [storeId]);

  /* ---------- progress ---------- */
  useEffect(() => {
    if (!trainees.length) return;

    (async () => {
      const realTasks = await loadAllRealTasks();
      const total = realTasks.length;
      const map: Record<string, number> = {};

      for (const t of trainees) {
        const snap = await getDocs(collection(db, "users", t.uid, "progress"));
        let done = 0;

        snap.forEach((d) => {
          if (!realTasks.includes(d.id)) return;
          const v: any = d.data();
          if (v.done || v.completed || v.approved) done++;
        });

        map[t.uid] = total ? Math.round((done / total) * 100) : 0;
      }

      setProgressMap(map);
    })();
  }, [trainees]);

  /* ---------- helpers ---------- */
  function getTrainerName(traineeId: string): string | null {
    const emp = employees.find((e) => e.uid === traineeId);
    if (!emp) return null;

    const trainerUid = emp.trainer || emp.supervisor;
    if (!trainerUid) return null;

    const trainer = employees.find((e) => e.uid === trainerUid);
    return trainer?.name || trainer?.email || null;
  }

  /* ---------- guards ---------- */
  if (!uid) return <main className="p-6">Please sign in.</main>;
  if (loading) return <main className="p-6">Loading…</main>;
  if (!storeId) return <main className="p-6">No store assigned.</main>;

  return (
    <main className="max-w-xl mx-auto p-4 space-y-6">
      {/* ⭐ ROLE HEADER */}
      <h1 className="text-xl font-bold mb-2">
        {role === "gm" ? "General Manager Dashboard" : "Manager Dashboard"}
      </h1>

      {/* Store */}
      {store && (
        <section className="rounded-xl border bg-white p-4">
          <div className="font-semibold">Store #{store.number}</div>
          <div className="text-sm">{store.name}</div>
          <div className="text-sm">{store.address}</div>
        </section>
      )}

      {/* Trainees */}
      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">Trainees</h2>

        {trainees.length === 0 ? (
          <p className="text-sm text-gray-500">No trainees yet.</p>
        ) : (
          <div className="space-y-4">
            {trainees.map((t) => (
              <Link
                key={t.uid}
                href={`/manager/employees/${t.uid}`}
                className="block rounded-lg border p-3 hover:bg-gray-50"
              >
                <div className="font-medium break-words">
                  {t.name || t.email}
                </div>

                {getTrainerName(t.uid) && (
                  <div className="text-xs text-gray-600 mt-1">
                    Trainer: {getTrainerName(t.uid)}
                  </div>
                )}

                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-yellow-500"
                    style={{ width: `${progressMap[t.uid] ?? 0}%` }}
                  />
                </div>

                <div className="text-xs text-gray-600 mt-1">
                  {progressMap[t.uid] ?? 0}% complete
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Store Users */}
      <section className="rounded-xl border bg-white p-4">
        <Link
          href="/manager/users"
          className="inline-flex items-center text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
        >
          Manage Store Users →
        </Link>
      </section>

      {/* Notes */}
      <section className="rounded-xl border bg-white p-4">
        <Link
          href={`/manager/notes?store=${storeId}`}
          className="text-sm font-medium hover:underline"
        >
          Notes
        </Link>
      </section>
    </main>
  );
}
