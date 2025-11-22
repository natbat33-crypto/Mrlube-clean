// components/manager/PromoteSupervisorToggle.tsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

type Props = {
  managerStoreId: string;   // the manager’s current store id
  employeeUid: string;      // the user doc id / auth uid of the employee
  className?: string;
};

export default function PromoteSupervisorToggle({
  managerStoreId,
  employeeUid,
  className,
}: Props) {
  const [role, setRole] = useState<string>("employee");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // load current role once
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", employeeUid));
        if (!alive) return;
        if (snap.exists()) {
          const v = snap.data() as any;
          setRole((v?.role as string) || "employee");
        }
      } catch {}
    })();
    return () => {
      alive = false;
    };
  }, [employeeUid]);

  async function toggle() {
    setBusy(true);
    setMsg("");
    try {
      const ref = doc(db, "users", employeeUid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setMsg("⚠️ User not found.");
        setBusy(false);
        return;
      }
      const v = snap.data() as any;

      // guard against cross-store changes
      const userStore = v?.storeId != null ? String(v.storeId) : null;
      if (userStore && userStore !== String(managerStoreId)) {
        setMsg("⚠️ Employee belongs to another store.");
        setBusy(false);
        return;
      }

      const nextRole = (role || "employee") === "supervisor" ? "employee" : "supervisor";
      await updateDoc(ref, {
        role: nextRole,
        ...(userStore ? {} : { storeId: String(managerStoreId) }), // backfill store if missing
      });

      setRole(nextRole);
      setMsg(nextRole === "supervisor" ? "✅ Promoted to Supervisor." : "✅ Reverted to Employee.");
      setTimeout(() => setMsg(""), 1500);
    } catch (e: any) {
      console.error(e);
      setMsg(`⚠️ Failed: ${e?.message || "permission/network error"}`);
    } finally {
      setBusy(false);
    }
  }

  const isSupervisor = role === "supervisor";

  return (
    <div className={className}>
      <button
        onClick={toggle}
        disabled={busy}
        className="px-3 py-1 rounded text-sm bg-black text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : isSupervisor ? "Demote to Employee" : "Promote to Supervisor"}
      </button>
      {msg && <div className="mt-1 text-xs text-gray-700">{msg}</div>}
    </div>
  );
}
