"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  setDoc,
} from "firebase/firestore";

/* ================= TYPES ================= */

type UserRow = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  storeId?: string;
  active?: boolean;
};

const ROLE_OPTIONS = [
  { value: "trainee", label: "Trainee" },
  { value: "supervisor", label: "Trainer" },
  { value: "manager", label: "Manager" },
];

/* ================= PAGE ================= */

export default function ManagerEmployeesPage() {
  const [managerUid, setManagerUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- AUTH ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;

      setManagerUid(u.uid);

      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const d: any = snap.data();
        if (d.storeId) setStoreId(String(d.storeId));
      }
    });

    return () => unsub();
  }, []);

  /* ---------- LOAD NEW EMPLOYEES ---------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      setLoading(true);

      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("storeId", "==", storeId)
        )
      );

      const rows: UserRow[] = snap.docs
        .map((d) => ({ ...(d.data() as any), id: d.id }))
        .filter(
          (u) =>
            u.role !== "admin" &&
            !u.role // only unassigned users
        );

      setUsers(rows);
      setLoading(false);
    })();
  }, [storeId]);

  /* ---------- ASSIGN ---------- */
  async function assignUser(userId: string, role: string) {
    if (!storeId) return;

    await updateDoc(doc(db, "users", userId), {
      role,
      active: true,
    });

    await setDoc(
      doc(db, "stores", storeId, "employees", userId),
      { role, active: true },
      { merge: true }
    );

    setUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  if (!managerUid || !storeId) {
    return <main className="p-6">No access</main>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* HEADER */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">New Employees</h1>
          <p className="text-sm text-gray-600">
            Assign roles for employees who joined your store.
          </p>
        </div>

        <Link
          href="/manager/users"
          className="text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
        >
          ← Back
        </Link>
      </header>

      <section className="rounded-xl border bg-white p-5">
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">
            No new employees waiting for assignment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">Name</th>
                  <th className="py-2 text-left">Email</th>
                  <th className="py-2 text-left">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b bg-yellow-50">
                    <td className="py-2">
                      {u.name || "—"}
                    </td>
                    <td className="py-2">
                      {u.email || "—"}
                    </td>
                    <td className="py-2">
                      <select
                        className="border rounded px-2 py-1 text-sm"
                        defaultValue=""
                        onChange={(e) =>
                          assignUser(u.id, e.target.value)
                        }
                      >
                        <option value="" disabled>
                          Select role…
                        </option>
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
