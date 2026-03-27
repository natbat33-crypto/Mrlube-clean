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
  addDoc,
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
  if (!active) {
    try {
      const user = users.find((u) => u.uid === uid); // ✅ ADD THIS LINE

      await fetch("/api/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          email: user?.email || "",
        }),
      });
    } catch (e) {
      console.error("[deactivate] API call failed:", e);
    }

      // 2. Email admin notification
      try {
        const user = users.find((u) => u.uid === uid);
        const userName = user?.name ?? "Unknown";
        const userEmail = user?.email ?? "no email on file";
        const roleLabel =
          user?.role === "supervisor" ? "Trainer" : user?.role ?? "Unknown";

        const storeSnap = await getDoc(doc(db, "stores", storeId));
        const adminEmail: string =
          storeSnap.data()?.adminEmail ?? "nataliegagnon444@gmail.com";

        await addDoc(collection(db, "mail"), {
          to: adminEmail,
          message: {
            subject: `Account deactivated — ${userName}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0b3d91;padding:20px 24px;">
                  <h2 style="color:#FFC20E;margin:0;">Mr Lube Training</h2>
                </div>
                <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;">
                  <p>The following account has been fully deactivated in the Mr Lube Training portal.</p>
                  <table style="font-size:14px;border-collapse:collapse;width:100%;">
                    <tr>
                      <td style="padding:6px 0;font-weight:600;width:120px;">Name</td>
                      <td style="padding:6px 0;">${userName}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-weight:600;">Email</td>
                      <td style="padding:6px 0;">${userEmail}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-weight:600;">Role</td>
                      <td style="padding:6px 0;">${roleLabel}</td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;font-weight:600;">Store ID</td>
                      <td style="padding:6px 0;">${storeId}</td>
                    </tr>
                  </table>
                  <p style="margin-top:16px;color:#555;font-size:14px;">
                    Their Firebase Auth account has been disabled and all active sessions revoked.
                    They can no longer log in.
                  </p>
                </div>
              </div>
            `,
          },
        });
      } catch (e) {
        console.warn("[deactivate notify] email failed:", e);
      }
    } else {
      // Reactivating — just update Firestore (no full Auth re-enable here)
      await updateDoc(doc(db, "users", uid), { active: true });
    }

    // 3. Update local UI
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
            <div className="w-full overflow-x-auto">
              <table className="min-w-[680px] w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left whitespace-nowrap">Name</th>
                    <th className="py-2 text-left whitespace-nowrap">Role</th>
                    <th className="py-2 text-left whitespace-nowrap">Status</th>
                    <th className="py-2 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.uid} className="border-b">
                      <td className="py-2 whitespace-nowrap">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>

                      <td className="py-2 capitalize whitespace-nowrap">
                        {u.role === "supervisor" ? "Trainer" : u.role}
                      </td>

                      <td className="py-2 whitespace-nowrap">
                        {u.active ? (
                          <span className="text-green-600">Active</span>
                        ) : (
                          <span className="text-red-600">Inactive</span>
                        )}
                      </td>

                      <td className="py-2 text-right whitespace-nowrap">
                        <select
                          defaultValue=""
                          onChange={(e) => changeRole(u.uid, e.target.value)}
                          className="border rounded px-2 py-1 text-xs"
                        >
                          <option value="" disabled>Change role…</option>
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>

                        <button
                          onClick={() => toggleActive(u.uid, !u.active)}
                          className="ml-2 text-xs underline text-gray-600"
                        >
                          {u.active ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
