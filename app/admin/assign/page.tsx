// app/admin/assign/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

type Person = { uid: string; email?: string; role?: string };

export default function AdminAssignPage() {
  const [storeId, setStoreId] = useState("24"); // default while piloting
  const [trainees, setTrainees] = useState<Person[]>([]);
  const [supervisors, setSupervisors] = useState<Person[]>([]);
  const [chosenTrainee, setChosenTrainee] = useState<string>("");
  const [chosenSupervisor, setChosenSupervisor] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // Load people from /users (or however you cache profiles)
  useEffect(() => {
    (async () => {
      // If you don’t have /users cached, comment this and type UIDs manually.
      const usersSnap = await getDocs(collection(db, "users"));
      const all: Person[] = usersSnap.docs.map(d => ({ uid: d.id, ...(d.data() as any) }));
      setTrainees(all.filter(u => (u.role ?? "").toLowerCase() === "trainee"));
      setSupervisors(all.filter(u => (u.role ?? "").toLowerCase() === "supervisor"));
    })().catch(() => {});
  }, []);

  async function ensureEmployeeDoc(uid: string, role: string) {
    // mark them active in this store
    await setDoc(
      doc(db, "stores", storeId, "employees", uid),
      { uid, role: role.toLowerCase(), active: true },
      { merge: true }
    );
  }

  async function assign() {
    if (!storeId || !chosenTrainee || !chosenSupervisor) {
      setMsg("Pick store, trainee, and supervisor.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      // create membership docs for both (cheap & idempotent)
      await ensureEmployeeDoc(chosenTrainee, "trainee");
      await ensureEmployeeDoc(chosenSupervisor, "supervisor");

      // map trainee -> supervisor
      await setDoc(
        doc(db, "stores", storeId, "traineeAssignments", chosenTrainee),
        { supervisorUid: chosenSupervisor },
        { merge: true }
      );

      setMsg("✅ Assigned! Notes and approvals will now work for this pair.");
    } catch (e: any) {
      setMsg(`❌ Failed: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin — Assign Trainees</h1>
        <Link href="/admin" className="rounded-full border px-3 py-1.5 text-sm">← Back</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1">
          <div className="text-sm font-medium">Store ID</div>
          <input
            value={storeId}
            onChange={e => setStoreId(e.target.value.trim())}
            className="w-full rounded border px-3 py-2"
            placeholder="e.g. 24"
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Trainee</div>
          <select
            value={chosenTrainee}
            onChange={e => setChosenTrainee(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— pick —</option>
            {trainees.map(t => (
              <option key={t.uid} value={t.uid}>
                {t.email ?? t.uid}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-sm font-medium">Supervisor</div>
          <select
            value={chosenSupervisor}
            onChange={e => setChosenSupervisor(e.target.value)}
            className="w-full rounded border px-3 py-2"
          >
            <option value="">— pick —</option>
            {supervisors.map(s => (
              <option key={s.uid} value={s.uid}>
                {s.email ?? s.uid}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={assign}
          disabled={saving}
          className="rounded-md border px-4 py-2 bg-white hover:bg-gray-50"
        >
          {saving ? "Saving…" : "Assign"}
        </button>
        {msg && <div className="text-sm">{msg}</div>}
      </div>

      <p className="text-xs text-gray-600">
        This writes:
        <br/>• <code>/stores/{"{storeId}"}/employees/{"{uid}"}</code> with <code>{`{active:true, role}`}</code>
        <br/>• <code>/stores/{"{storeId}"}/traineeAssignments/{"{traineeUid}"}</code> with <code>{`{supervisorUid}`}</code>
      </p>
    </main>
  );
}
