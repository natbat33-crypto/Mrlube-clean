// components/manager/AssignSupervisorToTrainee.tsx
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
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";

type Supervisor = { id: string; name?: string; email?: string };

export default function AssignSupervisorToTrainee({
  storeId,
  traineeId,
  className,
}: {
  storeId: string;
  traineeId: string;
  className?: string;
}) {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [currentSup, setCurrentSup] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  // Load supervisors for this store
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const qy = query(
          collection(db, "users"),
          where("role", "==", "supervisor"),
          where("storeId", "==", String(storeId))
        );
        const snap = await getDocs(qy);
        if (!mounted) return;
        setSupervisors(
          snap.docs.map((d) => {
            const v = d.data() as any;
            return {
              id: d.id,
              name: v.displayName || v.name || "Supervisor",
              email: v.email || "",
            };
          })
        );
      } catch (e) {
        console.error("Load supervisors failed:", e);
        if (mounted) setStatus("⚠️ Could not load supervisors.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [storeId]);

  // Load current trainee assignment so dropdown reflects it
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tSnap = await getDoc(doc(db, "trainees", traineeId));
        if (!mounted) return;
        if (tSnap.exists()) {
          const t = tSnap.data() as any;
          setCurrentSup(t.supervisorId || "");
        }
      } catch (e) {
        console.error("Load trainee failed:", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [traineeId]);

  async function save() {
    if (!traineeId) return;
    setBusy(true);
    setStatus("");

    try {
      const tRef = doc(db, "trainees", traineeId);
      const snap = await getDoc(tRef);

      // Create doc once if missing (with storeId)
      if (!snap.exists()) {
        await setDoc(
          tRef,
          {
            storeId: String(storeId),
            supervisorId: currentSup || null,
            supervisorAssignedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        const t = snap.data() as any;
        if (t?.storeId && String(t.storeId) !== String(storeId)) {
          setStatus("⚠️ Trainee belongs to a different store.");
          setBusy(false);
          return;
        }
        // Only update allowed fields per rules
        await updateDoc(tRef, {
          supervisorId: currentSup || null,
          supervisorAssignedAt: serverTimestamp(),
        });
      }

      // Optional: maintain store-scoped assignment map
      await setDoc(
        doc(db, "stores", String(storeId), "traineeAssignments", traineeId),
        {
          traineeUid: traineeId,
          supervisorId: currentSup || null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setStatus("✅ Saved.");
      setTimeout(() => setStatus(""), 1500);
    } catch (e: any) {
      console.error("Assign failed:", e);
      setStatus(`⚠️ Failed: ${e?.message || "permission/network error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          value={currentSup}
          onChange={(e) => setCurrentSup(e.target.value)}
          className="border rounded px-2 py-1 text-sm"
          disabled={busy}
        >
          <option value="">— Unassigned —</option>
          {supervisors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.email ? `(${s.email})` : ""}
            </option>
          ))}
        </select>

        <button
          onClick={save}
          disabled={busy}
          className="bg-black text-white text-sm px-3 py-1 rounded disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {status && <div className="mt-1 text-xs text-gray-700">{status}</div>}
    </div>
  );
}





