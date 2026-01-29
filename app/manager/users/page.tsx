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
  updateDoc,
  query,
  where,
  setDoc,
} from "firebase/firestore";
import { assignTrainee } from "@/lib/assignments";

/* ================= TYPES ================= */

type Emp = {
  uid: string;
  role?: string;
  name?: string;
  email?: string;
  active?: boolean;
};

type Store = {
  number: number;
  name: string;
};

/* ================= PAGE ================= */

export default function ManagerUsersPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  const [trainees, setTrainees] = useState<Emp[]>([]);
  const [trainers, setTrainers] = useState<Emp[]>([]);
  const [managers, setManagers] = useState<Emp[]>([]);

  const [selTrainee, setSelTrainee] = useState("");
  const [selTrainer, setSelTrainer] = useState("");
  const [status, setStatus] = useState("");

  const [loading, setLoading] = useState(true);

  /* ===== NEW EMPLOYEES ===== */
  const [showNewEmployees, setShowNewEmployees] = useState(false);
  const [newEmployees, setNewEmployees] = useState<Emp[]>([]);
  const [newEmpStatus, setNewEmpStatus] = useState("");

  /* ---------- AUTH ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;

      setUid(u.uid);

      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        const d: any = snap.data();
        if (d.storeId) setStoreId(String(d.storeId));
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* ---------- LOAD STORE ---------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const snap = await getDoc(doc(db, "stores", storeId));
      if (snap.exists()) setStore(snap.data() as Store);
    })();
  }, [storeId]);

  /* ---------- LOAD EMPLOYEES ---------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const snap = await getDocs(
        query(
          collection(db, "stores", storeId, "employees"),
          where("active", "==", true)
        )
      );

      const all = snap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as any),
      }));

      setTrainees(all.filter((e) => e.role === "trainee"));
      setTrainers(all.filter((e) => e.role === "supervisor"));
      setManagers(all.filter((e) => e.role === "manager"));
    })();
  }, [storeId]);

  /* ---------- LOAD NEW EMPLOYEES (AWAITING ROLE) ---------- */
  useEffect(() => {
    if (!storeId || !showNewEmployees) return;

    (async () => {
      try {
        setNewEmpStatus("Loading…");

        const snap = await getDocs(
          query(collection(db, "users"), where("storeId", "==", storeId))
        );

        const awaiting = snap.docs
          .map((d) => ({ uid: d.id, ...(d.data() as any) }))
          .filter(
            (u) =>
              !u.role &&
              u.active !== false &&
              u.uid !== uid
          );

        setNewEmployees(awaiting);
        setNewEmpStatus("");
      } catch {
        setNewEmpStatus("Failed to load");
      }
    })();
  }, [storeId, showNewEmployees, uid]);

  /* ---------- ASSIGN NEW EMPLOYEE (MIRRORS ADMIN) ---------- */
  async function assignNewEmployee(userId: string, role: string) {
    if (!storeId) return;

    try {
      setNewEmpStatus("Assigning…");

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

      setNewEmployees((prev) => prev.filter((u) => u.uid !== userId));

      const empSnap = await getDocs(
        query(
          collection(db, "stores", storeId, "employees"),
          where("active", "==", true)
        )
      );

      const all = empSnap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as any),
      }));

      setTrainees(all.filter((e) => e.role === "trainee"));
      setTrainers(all.filter((e) => e.role === "supervisor"));
      setManagers(all.filter((e) => e.role === "manager"));

      setNewEmpStatus("Assigned ✓");
      setTimeout(() => setNewEmpStatus(""), 1000);
    } catch {
      setNewEmpStatus("Failed");
    }
  }

  /* ---------- ASSIGN TRAINEE → TRAINER ---------- */
  async function doAssign() {
    if (!storeId || !selTrainee || !selTrainer) return;

    try {
      setStatus("Assigning…");
      await assignTrainee(storeId, selTrainee, selTrainer);
      setStatus("Assigned ✓");
      setSelTrainee("");
      setSelTrainer("");
      setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Failed");
    }
  }

  /* ---------- DEACTIVATE ---------- */
  async function deactivateUser(userId: string) {
    if (!storeId) return;

    await updateDoc(
      doc(db, "stores", storeId, "employees", userId),
      { active: false }
    );
  }

  if (loading) return <main className="p-6">Loading…</main>;
  if (!uid || !storeId) return <main className="p-6">No access</main>;

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      {/* HEADER */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Store Users</h1>
          {store && (
            <p className="text-sm text-gray-600">
              Store #{store.number} • {store.name}
            </p>
          )}
        </div>

        <Link
          href="/manager"
          className="text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
        >
          ← Back
        </Link>
      </header>

      {/* EMPLOYEES (CLICKABLE PANEL) */}
      <section className="rounded-xl border bg-white p-5">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h2 className="font-semibold mb-1">Employees</h2>
            <p className="text-sm text-gray-600">
              Assign roles to newly signed-up employees.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNewEmployees((v) => !v)}
            className="text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
          >
            {showNewEmployees ? "Hide ←" : "Manage new employees →"}
          </button>
        </div>

        {showNewEmployees && (
          <div className="mt-4 space-y-3">
            {newEmpStatus && (
              <div className="text-sm text-gray-500">{newEmpStatus}</div>
            )}

            {newEmployees.length === 0 ? (
              <p className="text-sm text-gray-500">
                No new employees waiting for assignment.
              </p>
            ) : (
              newEmployees.map((u) => (
                <div
                  key={u.uid}
                  className="flex justify-between items-center gap-4 border rounded-lg p-3 bg-yellow-50"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {u.name || u.email}
                    </div>
                    <div className="text-xs text-gray-600">
                      Awaiting role
                    </div>
                  </div>

                  <select
                    defaultValue=""
                    onChange={(e) =>
                      assignNewEmployee(u.uid, e.target.value)
                    }
                    className="border rounded px-2 py-1 text-sm"
                  >
                    <option value="" disabled>
                      Assign role…
                    </option>
                    <option value="trainee">Trainee</option>
                    <option value="supervisor">Trainer</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* TRAINEES */}
      <Section title="Trainees">
        {trainees.length === 0
          ? "No trainees."
          : trainees.map((t) => (
              <UserRow
                key={t.uid}
                user={t}
                roleLabel="Trainee"
                onDeactivate={() => deactivateUser(t.uid)}
              />
            ))}
      </Section>

      {/* TRAINERS */}
      <Section title="Trainers">
        {trainers.length === 0
          ? "No trainers."
          : trainers.map((t) => (
              <UserRow
                key={t.uid}
                user={t}
                roleLabel="Trainer"
                onDeactivate={() => deactivateUser(t.uid)}
              />
            ))}
      </Section>

      {/* MANAGERS */}
      <Section title="Managers">
        {managers.length === 0
          ? "No managers."
          : managers.map((m) => (
              <UserRow key={m.uid} user={m} roleLabel="Manager" readOnly />
            ))}
      </Section>

      {/* ASSIGN TRAINEE → TRAINER */}
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold mb-3">Assign Trainee → Trainer</h2>

        <div className="grid md:grid-cols-2 gap-3">
          <select
            value={selTrainee}
            onChange={(e) => setSelTrainee(e.target.value)}
            className="border rounded p-2 text-sm"
          >
            <option value="">Select trainee…</option>
            {trainees.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name || t.email}
              </option>
            ))}
          </select>

          <select
            value={selTrainer}
            onChange={(e) => setSelTrainer(e.target.value)}
            className="border rounded p-2 text-sm"
          >
            <option value="">Select trainer…</option>
            {trainers.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name || t.email}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={doAssign}
            disabled={!selTrainee || !selTrainer}
            className="border px-3 py-1 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Assign
          </button>
          {status && <span className="text-sm">{status}</span>}
        </div>
      </section>
    </main>
  );
}

/* ================= COMPONENTS ================= */

function Section({
  title,
  children,
}: {
  title: string;
  children: any;
}) {
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="font-semibold mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function UserRow({
  user,
  roleLabel,
  onDeactivate,
  readOnly,
}: {
  user: Emp;
  roleLabel: string;
  onDeactivate?: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-4 border rounded-lg p-3">
      <div className="min-w-0">
        <div className="font-medium truncate">
          {user.name || user.email}
        </div>
        <div className="text-xs text-gray-600">{roleLabel}</div>
      </div>

      {!readOnly && (
        <button
          onClick={onDeactivate}
          className="text-xs border rounded px-2 py-1 hover:bg-gray-50"
        >
          Deactivate
        </button>
      )}
    </div>
  );
}
