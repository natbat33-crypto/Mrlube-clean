// components/manager/StorePeople.tsx
"use client";

import Link from "next/link";
// ⬇️ use the overall progress bar (weeks 1–4)
import StoreOverallProgress from "@/components/manager/StoreOverallProgress";
import AssignSupervisorToTrainee from "@/components/manager/AssignSupervisorToTrainee";
import PromoteSupervisorToggle from "@/components/manager/PromoteSupervisorToggle";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

type Person = {
  id: string;
  displayName?: string;
  email?: string;
  role?: string;
  status?: string;
  isTraining?: boolean;
  storeId?: string | number;
  uid?: string; // auth UID if stored
};

export default function StorePeople({
  storeId,
  testTraineeId, // when present, we show ONLY this trainee
}: {
  storeId: string;
  testTraineeId?: string;
}) {
  const [supervisor, setSupervisor] = useState<Person | null>(null);
  const [trainees, setTrainees] = useState<Person[]>([]);
  const [employees, setEmployees] = useState<Person[]>([]); // ✅ NEW: plain employees (promote/demote)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // --- Supervisor (same logic as before)
        let sup: Person | null = null;
        try {
          const storeRef = doc(db, "stores", storeId);
          const subSupSnap = await getDocs(collection(storeRef, "supervisors"));
          if (!subSupSnap.empty) {
            sup = { id: subSupSnap.docs[0].id, ...(subSupSnap.docs[0].data() as any) };
          } else {
            const usersCol = collection(db, "users");
            const asNum = Number(storeId);
            const qs = await Promise.all([
              getDocs(query(usersCol, where("storeId", "==", storeId))),
              !Number.isNaN(asNum)
                ? getDocs(query(usersCol, where("storeId", "==", asNum)))
                : Promise.resolve({ empty: true, docs: [] } as any),
            ]);

            const rows = new Map<string, Person>();
            for (const s of qs) if (!s.empty) for (const d of (s as any).docs)
              rows.set(d.id, { id: d.id, ...(d.data() as any) });

            sup =
              Array.from(rows.values()).find(
                (u) => (u.role || "").toLowerCase() === "supervisor"
              ) ?? null;
          }
        } catch {
          // ignore supervisor errors
        }

        // --- Force a single trainee when testTraineeId is provided
        if (testTraineeId) {
          let one: Person | null = null;

          const byId = await getDoc(doc(db, "users", testTraineeId));
          if (byId.exists()) {
            one = { id: byId.id, ...(byId.data() as any) };
          } else {
            const snap = await getDocs(
              query(collection(db, "users"), where("uid", "==", testTraineeId))
            );
            if (!snap.empty) {
              const d = snap.docs[0];
              one = { id: d.id, ...(d.data() as any) };
            }
          }

          if (!alive) return;
          setSupervisor(sup);
          setTrainees(one ? [one] : []);
          setEmployees([]); // keep employees empty in test mode
          setLoading(false);
          return; // stop here when forcing a single trainee
        }

        // --- Original trainee loading (only used when no testTraineeId)
        let trs: Person[] = [];
        const storeRef = doc(db, "stores", storeId);
        const subTraSnap = await getDocs(collection(storeRef, "trainees"));

        if (!subTraSnap.empty) {
          trs = subTraSnap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as any) } as Person)
          );
        } else {
          const usersCol = collection(db, "users");
          const qStr = query(usersCol, where("storeId", "==", storeId));
          const asNum = Number(storeId);
          const qNum =
            !Number.isNaN(asNum) ? query(usersCol, where("storeId", "==", asNum)) : null;

          const [strSnap, numSnap] = await Promise.all([
            getDocs(qStr),
            qNum ? getDocs(qNum) : Promise.resolve({ empty: true, docs: [] } as any),
          ]);

          const rowsMap = new Map<string, Person>();
          for (const d of strSnap.docs) rowsMap.set(d.id, { id: d.id, ...(d.data() as any) });
          if (numSnap && !(numSnap as any).empty) {
            for (const d of (numSnap as any).docs)
              rowsMap.set(d.id, { id: d.id, ...(d.data() as any) });
          }
          const rows = Array.from(rowsMap.values());

          trs = rows.filter((u) => {
            const roleOk = (u.role || "").toLowerCase() === "trainee";
            const status = (u.status || "").toLowerCase();
            const active =
              u.isTraining === true ||
              status === "in_progress" ||
              status === "training" ||
              u.status === undefined;
            return roleOk && active;
          });

          // ✅ employees list (for promote/demote)
          const emps = rows.filter((u) => (u.role || "").toLowerCase() === "employee");
          setEmployees(emps);
        }

        if (!alive) return;
        setSupervisor(sup);
        setTrainees(trs);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [storeId, testTraineeId]);

  const renderName = (p: Person | null, fallbackLabel: string) => {
    if (!p) return null;
    const nice = p.displayName || p.email;
    return `${fallbackLabel} – ${nice || "John Doe"}`;
  };

  return (
    <div className="rounded-xl border bg-white/50 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Supervisor</h2>
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : supervisor ? (
          <div className="text-sm">{renderName(supervisor, "Supervisor")}</div>
        ) : (
          <p className="text-sm text-gray-500">No supervisor assigned yet.</p>
        )}
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Trainees (in training)</h2>
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : trainees.length === 0 ? (
          <p className="text-sm text-gray-500">No active trainees yet.</p>
        ) : (
          <ul className="space-y-2">
            {trainees.map((t) => {
              const key = t.uid ?? t.id; // prefer auth UID
              return (
                <li
                  key={`${t.id}-${t.uid ?? "noUid"}`}
                  className="text-sm rounded border px-3 py-2 bg-white"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/manager/trainees/${key}?store=${encodeURIComponent(storeId)}`}
                      className="hover:underline flex-1 min-w-0"
                      title="Open trainee progress"
                    >
                      {renderName(t, "Trainee")}
                    </Link>

                    {/* overall Week 1–4 progress bar */}
                    <StoreOverallProgress traineeId={key} traineeUid={t.uid} />
                  </div>

                  {/* ✅ Assign this trainee to a supervisor (store-scoped) */}
                  <div className="mt-2">
                    <AssignSupervisorToTrainee
                      storeId={storeId}
                      traineeId={t.uid ?? t.id}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ✅ NEW: Employees section at the bottom */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Employees</h2>
        {loading ? (
          <p className="text-sm text-gray-600">Loading…</p>
        ) : employees.length === 0 ? (
          <p className="text-sm text-gray-500">No employees found for this store.</p>
        ) : (
          <ul className="space-y-2">
            {employees.map((e) => (
              <li key={`${e.id}-${e.uid ?? "noUid"}`} className="text-sm rounded border px-3 py-2 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {renderName(e, "Employee")}
                  </div>
                  {/* Promote/Demote toggle (store-scoped) */}
                  <PromoteSupervisorToggle
                    managerStoreId={storeId}
                    employeeUid={e.uid ?? e.id}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}






