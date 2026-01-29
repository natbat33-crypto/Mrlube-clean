"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RoleGate from "@/components/RoleGate";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
} from "firebase/firestore";

type UserRow = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  storeId?: string | null;
  active?: boolean;
};

type StoreRow = {
  id: string;
  number?: string;
  name?: string;
};

const ROLE_OPTIONS = [
  { value: "trainee", label: "Trainee" },
  { value: "supervisor", label: "Trainer" },
  { value: "manager", label: "Manager" },
  { value: "gm", label: "General Manager" },
];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingStore, setPendingStore] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      const [usersSnap, storesSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "stores")),
      ]);

      const allUsers: UserRow[] = usersSnap.docs.map((d) => ({
        ...(d.data() as UserRow),
        id: d.id,
      }));

      const unassignedUsers = allUsers.filter((u) => {
        if (u.storeId) return false;
        if (u.role === "admin") return false;
        return true;
      });

      const storeRows: StoreRow[] = storesSnap.docs.map((d) => ({
        ...(d.data() as StoreRow),
        id: d.id,
      }));

      setUsers(unassignedUsers);
      setStores(storeRows);
      setLoading(false);
    };

    load();
  }, []);

  const deactivateUser = async (userId: string) => {
    if (!confirm("Deactivate this user?")) return;

    const res = await fetch("/api/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: userId }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      alert("Error deactivating user");
      return;
    }

    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const assignUser = async (
    userId: string,
    role: string,
    storeId: string
  ) => {
    if (!storeId) return;

    await updateDoc(doc(db, "users", userId), {
      role,
      storeId,
      active: true,
    });

    await setDoc(
      doc(db, "stores", storeId, "employees", userId),
      { role, active: true },
      { merge: true }
    );

    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  return (
    <RoleGate allow={["admin"]}>
      <main className="p-4 sm:p-6 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">New Users</h1>
            <p className="text-muted-foreground mt-1">
              Assign newly signed-up users to a store and role.
            </p>
          </div>

          <Link
            href="/admin"
            className="inline-flex items-center text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50 w-fit"
          >
            ← Back to Dashboard
          </Link>
        </header>

        <div className="rounded-xl border bg-white/50 p-4 sm:p-6">
          <h2 className="text-xl font-semibold mb-4">Needs Assignment</h2>

          {loading ? (
            <p className="text-sm text-gray-500">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-500">
              No users waiting for assignment.
            </p>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 whitespace-nowrap">Name</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Email</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Store</th>
                    <th className="py-2 pr-4 whitespace-nowrap">Role</th>
                    <th className="py-2 pr-4 whitespace-nowrap min-w-[120px]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b bg-yellow-50">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {u.name || "—"}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {u.email || "—"}
                      </td>

                      <td className="py-2 pr-4 whitespace-nowrap">
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          defaultValue=""
                          onChange={(e) =>
                            setPendingStore((prev) => ({
                              ...prev,
                              [u.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="" disabled>
                            Select store…
                          </option>
                          {stores.map((s) => (
                            <option key={s.id} value={s.id}>
                              Store #{s.number}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-2 pr-4 whitespace-nowrap">
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          defaultValue=""
                          disabled={!pendingStore[u.id]}
                          onChange={(e) =>
                            assignUser(
                              u.id,
                              e.target.value,
                              pendingStore[u.id]
                            )
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

                      <td className="py-2 pr-4 whitespace-nowrap">
                        <button
                          onClick={() => deactivateUser(u.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Deactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </RoleGate>
  );
}