// app/admin/stores/[id]/users/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";

type StoreUser = {
  uid: string;
  name: string;
  email?: string;
  role: string;
  active: boolean;
};

const ROLE_OPTIONS = [
  { value: "trainee", label: "Trainee" },
  { value: "supervisor", label: "Trainer" },
  { value: "manager", label: "Manager" },
  { value: "gm", label: "General Manager" },
];

export default function StoreUsersPage({
  params,
}: {
  params: { id: string };
}) {
  const storeId = params.id;

  const [users, setUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const rows: StoreUser[] = [];

      // ---- Employees (manager / trainer) ----
      const empSnap = await getDocs(
        collection(db, "stores", storeId, "employees")
      );

      for (const emp of empSnap.docs) {
        const data = emp.data();
        const userSnap = await getDoc(doc(db, "users", emp.id));
        const u = userSnap.data();

        rows.push({
          uid: emp.id,
          name: u?.displayName || u?.name || u?.email || "Unknown",
          email: u?.email,
          role: data.role,
          active: u?.active !== false,
        });
      }

      // ---- Trainees ----
      const traineeSnap = await getDocs(
        collection(db, "stores", storeId, "trainees")
      );

      for (const tr of traineeSnap.docs) {
        const traineeId = tr.data().traineeId || tr.id;
        const userSnap = await getDoc(doc(db, "users", traineeId));
        const u = userSnap.data();

        rows.push({
          uid: traineeId,
          name: u?.displayName || u?.name || u?.email || "Trainee",
          email: u?.email,
          role: "trainee",
          active: u?.active !== false,
        });
      }

      // Deduplicate
      const uniq = Object.values(
        Object.fromEntries(rows.map((r) => [r.uid, r]))
      );

      setUsers(uniq);
      setLoading(false);
    };

    load();
  }, [storeId]);

  const changeRole = async (uid: string, role: string) => {
    await setDoc(
      doc(db, "stores", storeId, "employees", uid),
      { role, uid },
      { merge: true }
    );

    await updateDoc(doc(db, "users", uid), {
      role,
      storeId,
      active: true,
    });

    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, role } : u))
    );
  };

  const toggleActive = async (uid: string, active: boolean) => {
    await updateDoc(doc(db, "users", uid), { active });

    setUsers((prev) =>
      prev.map((u) => (u.uid === uid ? { ...u, active } : u))
    );
  };

  return (
    <RoleGate allow={["admin"]}>
      <main className="mx-auto max-w-4xl p-4 lg:p-6 space-y-6">
        <header>
          <h1 className="text-xl font-semibold">Store Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage roles and access for this store.
          </p>
        </header>

        <div className="rounded-xl border bg-white p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading users…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 text-left">Name</th>
                  <th className="py-2 text-left">Role</th>
                  <th className="py-2 text-left">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid} className="border-b">
                    <td className="py-2">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {u.email}
                      </div>
                    </td>

                    <td className="py-2 capitalize">
                      {u.role === "supervisor" ? "Trainer" : u.role}
                    </td>

                    <td className="py-2">
                      {u.active ? (
                        <span className="text-green-600">Active</span>
                      ) : (
                        <span className="text-red-600">Inactive</span>
                      )}
                    </td>

                    <td className="py-2 text-right space-x-2">
                      <select
                        defaultValue=""
                        onChange={(e) =>
                          changeRole(u.uid, e.target.value)
                        }
                        className="border rounded px-2 py-1 text-xs"
                      >
                        <option value="" disabled>
                          Change role…
                        </option>
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => toggleActive(u.uid, !u.active)}
                        className="text-xs underline text-gray-600"
                      >
                        {u.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Link
          href={`/admin/stores/${storeId}`}
          className="inline-flex rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          ← Back to Store
        </Link>
      </main>
    </RoleGate>
  );
}
