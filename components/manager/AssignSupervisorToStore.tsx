// components/manager/AssignSupervisorToStore.tsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  updateDoc,        // ← add this
} from "firebase/firestore";

type Supervisor = { id: string; name: string; email: string };

export default function AssignSupervisorToStore({
  storeId,
  traineeId,      // ← OPTIONAL: pass a trainee id to assign to this supervisor too
}: {
  storeId: string;
  traineeId?: string;
}) {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  // Load supervisors list (you can later filter by role + store if desired)
  useEffect(() => {
    (async () => {
      try {
        const qs = await getDocs(collection(db, "users"));
        const list: Supervisor[] = [];
        qs.forEach((d) => {
          const v: any = d.data();
          if (v?.role === "supervisor") {
            list.push({
              id: d.id,
              name: v.displayName || v.name || "Unnamed Supervisor",
              email: v.email || "",
            });
          }
        });
        setSupervisors(list);
      } catch (e) {
        console.error("Load supervisors failed:", e);
        setStatus("⚠️ Could not load supervisors (check Firestore rules).");
      }
    })();
  }, []);

  async function assign() {
    if (!selected) return;
    setBusy(true);
    setStatus("");

    try {
      const chosen = supervisors.find((s) => s.id === selected);

      // Batch writes for store metadata and cleanup (same as before)
      const batch = writeBatch(db);

      // 1) store -> supervisor
      const storeRef = doc(db, "stores", String(storeId));
      batch.set(
        storeRef,
        {
          supervisorUid: selected,
          supervisorName: chosen?.name ?? null,
          supervisorEmail: chosen?.email ?? null,
          updatedAt: Date.now(),
        },
        { merge: true }
      );

      // 2) optional cleanup: unassign this supervisor from other stores
      const otherStores = await getDocs(
        query(collection(db, "stores"), where("supervisorUid", "==", selected))
      );
      otherStores.docs.forEach((d) => {
        if (d.id !== String(storeId)) {
          batch.set(
            doc(db, "stores", d.id),
            {
              supervisorUid: null,
              supervisorName: null,
              supervisorEmail: null,
              updatedAt: Date.now(),
            },
            { merge: true }
          );
        }
      });

      await batch.commit();

      // 3) user -> store (ensure supervisor user doc reflects this store)
      const supRef = doc(db, "users", selected);
      await setDoc(supRef, { storeId: String(storeId) }, { merge: true });

      // 4) If a trainee was provided, assign them to this supervisor (and set store if missing)
      if (traineeId) {
        const tRef = doc(db, "trainees", traineeId);
        const tSnap = await getDoc(tRef);
        if (!tSnap.exists()) {
          throw new Error("Trainee not found.");
        }
        const t = tSnap.data() as any;

        // Guard: prevent cross-store assignment (optional strictness)
        if (t.storeId && t.storeId !== String(storeId)) {
          throw new Error("Trainee belongs to a different store.");
        }

        await updateDoc(tRef, {
          supervisorId: selected,
          ...(t.storeId ? {} : { storeId: String(storeId) }), // backfill storeId if missing
        });
      }

      // 5) verify writes for feedback
      const [storeSnap, userSnap] = await Promise.all([getDoc(storeRef), getDoc(supRef)]);
      const ok =
        storeSnap.exists() &&
        (storeSnap.data() as any)?.supervisorUid === selected &&
        userSnap.exists() &&
        (userSnap.data() as any)?.storeId === String(storeId);

      // if we also assigned a trainee, we can trust updateDoc or do a quick check:
      if (traineeId) {
        const tCheck = await getDoc(doc(db, "trainees", traineeId));
        const tv = tCheck.data() as any;
        if (!(tv && tv.supervisorId === selected)) {
          setStatus("⚠️ Store set, but trainee assignment verification failed.");
          setBusy(false);
          return;
        }
      }

      setStatus(ok ? "✅ Assigned successfully!" : "⚠️ Assigned, but verification failed.");
      if (ok) setTimeout(() => setStatus(""), 2500);
    } catch (e: any) {
      console.error("Assign error:", e);
      setStatus(`⚠️ Failed to assign: ${e?.message || "permission or network error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
        >
          <option value="">Select supervisor…</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.email})
            </option>
          ))}
        </select>

        <button
          onClick={assign}
          disabled={!selected || busy}
          className="bg-black text-white text-sm px-3 py-1 rounded disabled:opacity-50"
        >
          {busy ? "Assigning…" : "Assign"}
        </button>
      </div>

      {status && <div className="text-xs text-gray-700">{status}</div>}
    </div>
  );
}


