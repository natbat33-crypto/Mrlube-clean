"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { assignTrainee } from "@/lib/assignments";

/* ---------------- types ---------------- */
type Emp = {
  uid: string;
  role?: string;
  name?: string;
  email?: string;
  active?: boolean;
  supervisor?: string; // where assignTrainee likely writes
  trainer?: string;    // future-safe if you rename field
};

type Store = {
  number: number;
  name: string;
  address: string;
};

/* -----------------------------------------------------------
   REAL TASK IDS
----------------------------------------------------------- */
async function loadAllRealTasks(): Promise<string[]> {
  const result: string[] = [];

  async function addTasks(parent: string, week: string, sub: string) {
    const snap = await getDocs(collection(db, parent, week, sub));
    snap.forEach((d) => {
      const progId = `${parent}__${week}__${sub}__${d.id}`;
      result.push(progId);
    });
  }

  await addTasks("days", "day-1", "tasks");
  await addTasks("modules", "week1", "tasks");
  await addTasks("modules", "week2", "tasks");
  await addTasks("modules", "week3", "tasks");
  await addTasks("modules", "week4", "tasks");

  return result;
}

/* ===========================================================
   MANAGER DASHBOARD
=========================================================== */
export default function ManagerDashboard() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  const [supervisors, setSupervisors] = useState<Emp[]>([]);
  const [trainees, setTrainees] = useState<Emp[]>([]);
  const [everyone, setEveryone] = useState<Emp[]>([]);
  const [openStaff, setOpenStaff] = useState(false);

  const [selTrainee, setSelTrainee] = useState("");
  const [selSupervisor, setSelSupervisor] = useState("");
  const [status, setStatus] = useState("");

  const [loading, setLoading] = useState(true);

  const [progressMap, setProgressMap] =
    useState<Record<string, number>>({});

  /* ---------- auth ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (!u) {
        setUid(null);
        setStoreId(null);
        setLoading(false);
        return;
      }

      setUid(u.uid);

      let sid: string | null = null;
      const userSnap = await getDoc(doc(db, "users", u.uid));
      if (userSnap.exists()) {
        const d: any = userSnap.data();
        if (d.storeId) sid = String(d.storeId);
      }

      setStoreId(sid);

      if (sid) {
        const storeSnap = await getDoc(doc(db, "stores", sid));
        if (storeSnap.exists()) {
          setStore(storeSnap.data() as Store);
        }
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* ---------- load staff ---------- */
  async function loadRole(role: string): Promise<Emp[]> {
    const coll = collection(db, "stores", storeId!, "employees");
    try {
      const s = await getDocs(
        query(coll, where("active", "==", true), where("role", "==", role))
      );
      return s.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
    } catch {
      return [];
    }
  }

  useEffect(() => {
    if (!uid || !storeId) return;

    let alive = true;
    (async () => {
      try {
        const [supList, trnList, all] = await Promise.all([
          loadRole("supervisor"),
          loadRole("trainee"),
          (async () => {
            const s = await getDocs(
              query(
                collection(db, "stores", storeId, "employees"),
                where("active", "==", true)
              )
            );
            return s.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
          })(),
        ]);

        if (!alive) return;

        setSupervisors(supList);
        setTrainees(trnList);
        setEveryone(all);
      } catch {
        // ignore for now, page will just show empty lists
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid, storeId]);

  /* ---------- progress calculation ---------- */
  useEffect(() => {
    if (!trainees.length) return;

    let alive = true;

    (async () => {
      const realTasks = await loadAllRealTasks();
      const total = realTasks.length;

      const map: Record<string, number> = {};

      for (const t of trainees) {
        const snap = await getDocs(collection(db, "users", t.uid, "progress"));

        let done = 0;

        snap.forEach((d) => {
          const taskId = d.id;
          if (!realTasks.includes(taskId)) return;

          const v: any = d.data();

          const isDone =
            v.done === true ||
            v.completed === true ||
            v.status === "done" ||
            v.approved === true ||
            !!v.approvedBy;

          if (isDone) done++;
        });

        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        map[t.uid] = percent;
      }

      if (alive) setProgressMap(map);
    })();

    return () => {
      alive = false;
    };
  }, [trainees]);

  /* ---------- assign trainee ---------- */
  async function doAssign() {
    if (!uid || !storeId || !selTrainee || !selSupervisor) return;

    try {
      setStatus("Assigning…");
      await assignTrainee(storeId, selTrainee, selSupervisor);
      setStatus("Assigned ✓");
      setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Failed");
    }
  }

  /* ---------- helper: find trainer for a trainee ---------- */
  function getTrainerLabelForTrainee(traineeId: string): string | null {
    // find this trainee’s employee doc in the store
    const empDoc = everyone.find((e) => e.uid === traineeId);
    if (!empDoc) return null;

    const trainerUid =
      (empDoc.trainer as string | undefined) ||
      (empDoc.supervisor as string | undefined);

    if (!trainerUid) return null;

    const trainerEmp =
      everyone.find((e) => e.uid === trainerUid) ||
      supervisors.find((s) => s.uid === trainerUid);

    if (!trainerEmp) return null;

    return trainerEmp.name || trainerEmp.email || null;
  }

  /* ---------- render ---------- */
  if (!uid) return <main className="p-8">Please sign in.</main>;
  if (loading) return <main className="p-8">Loading…</main>;
  if (!storeId) return <main className="p-8">No store assigned.</main>;

  // employees list should not duplicate trainees
  const nonTraineeEmployees = everyone.filter(
    (e) => e.active && String(e.role || "").toLowerCase() !== "trainee"
  );

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {store && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="text-lg font-semibold">
            Store #{store.number}
          </div>
          <div className="text-sm">{store.name}</div>
          <div className="text-sm">{store.address}</div>
        </section>
      )}

      {/* NOTES */}
      <section className="rounded-2xl border bg-white p-5">
        <Link
          href={`/manager/notes?store=${storeId}`}
          className="flex items-center gap-3"
        >
          <div className="h-10 w-10 flex items-center justify-center rounded-xl border bg-white">
            💬
          </div>
          <div>
            <div className="font-semibold">Notes & Messages</div>
            <div className="text-sm text-gray-600">
              Tap to view and send messages
            </div>
          </div>
        </Link>
      </section>

      {/* STAFF */}
      <section className="rounded-2xl border bg-white p-5">
        <button
          className="w-full flex justify-between items-center"
          onClick={() => setOpenStaff(!openStaff)}
        >
          <div className="font-semibold text-gray-900">Store Staff</div>
          <span className="text-gray-500">
            {openStaff ? "▲" : "▼"}
          </span>
        </button>

        {openStaff && (
          <div className="mt-5 space-y-6">
            {/* Trainers (formerly Supervisors) */}
            <Block title="Trainers">
              {supervisors.length === 0
                ? "No trainers yet."
                : supervisors.map((s) => (
                    <div
                      key={s.uid}
                      className="text-xs sm:text-sm break-words whitespace-normal"
                    >
                      {s.name || s.email}
                    </div>
                  ))}
            </Block>

            {/* Trainees */}
            <Block title="Trainees">
              {trainees.length === 0
                ? "No trainees yet."
                : trainees.map((t) => {
                    const trainerLabel = getTrainerLabelForTrainee(t.uid);

                    return (
                      <Link
                        href={`/manager/employees/${t.uid}`}
                        key={t.uid}
                        className="mb-4 block cursor-pointer rounded-xl p-2 hover:bg-gray-50"
                      >
                        <div className="break-words whitespace-normal text-sm font-medium">
                          {t.name || t.email}
                        </div>

                        {t.email && (
                          <div className="text-xs text-gray-600 break-words whitespace-normal">
                            {t.email}
                          </div>
                        )}

                        {trainerLabel && (
                          <div className="mt-1 text-[11px] text-gray-700">
                            Trainer: {trainerLabel}
                          </div>
                        )}

                        <div className="w-full bg-gray-200 rounded-full h-3 mt-2 overflow-hidden">
                          <div
                            className="h-3 rounded-full"
                            style={{
                              width: `${progressMap[t.uid] ?? 0}%`,
                              backgroundColor: "#f2b705",
                            }}
                          />
                        </div>

                        <div className="text-xs text-gray-600 mt-1">
                          {progressMap[t.uid] ?? 0}% complete
                        </div>
                      </Link>
                    );
                  })}
            </Block>

            {/* Employees (non-trainee) */}
            <Block title="Employees">
              {nonTraineeEmployees.length === 0
                ? "No employees yet."
                : nonTraineeEmployees.map((e) => (
                    <div
                      key={e.uid}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs sm:text-sm break-words whitespace-normal"
                    >
                      <div className="break-words whitespace-normal">
                        {e.name || e.email}
                        {e.email && e.name && (
                          <span className="text-gray-500">
                            {" "}
                            • {e.email}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] sm:text-xs text-gray-600">
                        {String(e.role || "").toLowerCase()}
                      </div>
                    </div>
                  ))}
            </Block>

            {/* Assign */}
            <section className="border rounded-2xl bg-white p-5">
              <h3 className="font-semibold mb-3">
                Assign Trainee → Trainer
              </h3>

              <div className="grid md:grid-cols-2 gap-3">
                <label className="text-sm">
                  Trainee
                  <select
                    value={selTrainee}
                    onChange={(e) => setSelTrainee(e.target.value)}
                    className="mt-1 w-full border rounded-md p-2 text-sm"
                  >
                    <option value="">Select trainee…</option>
                    {trainees.map((t) => (
                      <option key={t.uid} value={t.uid}>
                        {t.name || t.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm">
                  Trainer
                  <select
                    value={selSupervisor}
                    onChange={(e) => setSelSupervisor(e.target.value)}
                    className="mt-1 w-full border rounded-md p-2 text-sm"
                  >
                    <option value="">Select trainer…</option>
                    {supervisors.map((s) => (
                      <option key={s.uid} value={s.uid}>
                        {s.name || s.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={doAssign}
                  disabled={!selTrainee || !selSupervisor}
                  className="border px-3 py-1 rounded text-sm hover:bg-gray-50 disabled:opacity-60"
                >
                  Assign
                </button>

                {status && (
                  <span className="text-sm text-gray-600">{status}</span>
                )}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------------- Block Component ---------------- */
function Block({
  title,
  children,
}: {
  title: string;
  children: any;
}) {
  return (
    <div className="rounded-2xl bg-white p-5">
      <div className="font-semibold mb-2">{title}</div>
      <div className="text-sm break-words whitespace-normal">
        {children}
      </div>
    </div>
  );
}
