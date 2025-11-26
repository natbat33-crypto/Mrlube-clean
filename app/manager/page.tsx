"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, onIdTokenChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { assignTrainee } from "@/lib/assignments";

/* ---------- types ---------- */
type Emp = {
  uid: string;
  role?: string;
  name?: string;
  email?: string;
  active?: boolean;
  storeId?: string | number;
};

type Store = {
  number: number;
  name: string;
  address: string;
};

type ManagerGate = {
  ok: boolean;
  source: "employees" | "roster" | null;
};

/* ---------- manager gate ---------- */
async function isActiveManagerForStore(
  storeId: string,
  uid: string
): Promise<ManagerGate> {
  // employees
  const empRef = doc(db, "stores", storeId, "employees", uid);
  const empSnap = await getDoc(empRef);
  if (empSnap.exists()) {
    const d = empSnap.data() as any;
    const role = String(d.role || d.title || "").toLowerCase();
    if (role === "manager" && d.active !== false) {
      return { ok: true, source: "employees" };
    }
  }

  // roster fallback
  const rosRef = doc(db, "stores", storeId, "roster", uid);
  const rosSnap = await getDoc(rosRef);
  if (rosSnap.exists()) {
    const d = rosSnap.data() as any;
    const role = String(d.role || d.title || "").toLowerCase();
    if (role === "manager" && d.active !== false) {
      return { ok: true, source: "roster" };
    }
  }

  return { ok: false, source: null };
}

/* ===========================================================
   MANAGER DASHBOARD — FINAL
   =========================================================== */
export default function ManagerDashboard() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);

  // store staff
  const [supervisors, setSupervisors] = useState<Emp[]>([]);
  const [trainees, setTrainees] = useState<Emp[]>([]);
  const [everyone, setEveryone] = useState<Emp[]>([]);

  // manager gate
  const [empCheck, setEmpCheck] =
    useState<"check" | "ok" | "missing" | "error">("check");
  const [empSource, setEmpSource] = useState<"employees" | "roster" | null>(
    null
  );

  // assignment panel
  const [selTrainee, setSelTrainee] = useState("");
  const [selSupervisor, setSelSupervisor] = useState("");
  const [status, setStatus] = useState("");

  const [loading, setLoading] = useState(true);
  const [openStaff, setOpenStaff] = useState(false);

  /* ---------- auth ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (!u) {
        setUid(null);
        setStoreId(null);
        setStore(null);
        return setLoading(false);
      }

      setUid(u.uid);

      let sid: string | null = null;

      try {
        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const d: any = userSnap.data();
          if (d?.storeId) sid = String(d.storeId);
        }

        // fallback
        if (!sid) {
          const { autoConnect } = await import("@/lib/autoConnect");
          const res = await autoConnect();
          if (res?.storeId) sid = String(res.storeId);
        }
      } catch {}

      setStoreId(sid);

      if (sid) {
        const snap = await getDoc(doc(db, "stores", sid));
        setStore(snap.exists() ? (snap.data() as Store) : null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* ---------- load store staff ---------- */
  async function loadRole(role: string): Promise<Emp[]> {
    const coll = collection(db, "stores", storeId!, "employees");
    try {
      const q1 = query(
        coll,
        where("active", "==", true),
        where("role", "==", role)
      );
      const s1 = await getDocs(q1);
      let rows = s1.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));

      if (rows.length === 0) {
        const all = await getDocs(coll);
        rows = all.docs
          .map((d) => ({ uid: d.id, ...(d.data() as any) }))
          .filter(
            (e) =>
              e.active === true &&
              String((e.role || "")).toLowerCase() === role
          );
      }

      return rows;
    } catch {
      const all = await getDocs(coll);
      return all.docs
        .map((d) => ({ uid: d.id, ...(d.data() as any) }))
        .filter(
          (e) =>
            e.active === true &&
            String((e.role || "")).toLowerCase() === role
        );
    }
  }

  /* ---------- load staff ---------- */
  useEffect(() => {
    if (!uid || !storeId) return;

    let alive = true;

    (async () => {
      setEmpCheck("check");

      try {
        const [supList, trnList, allList] = await Promise.all([
          loadRole("supervisor"),
          loadRole("trainee"),
          (async () => {
            const coll = collection(db, "stores", storeId, "employees");
            const s = await getDocs(query(coll, where("active", "==", true)));
            return s.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));
          })(),
        ]);

        if (!alive) return;

        setSupervisors(supList);
        setTrainees(trnList);
        setEveryone(allList);

        const gate = await isActiveManagerForStore(storeId, uid);
        if (gate.ok) {
          setEmpCheck("ok");
          setEmpSource(gate.source);
        } else {
          const me = allList.find((e) => e.uid === uid);
          const isMgr =
            me?.active === true &&
            String(me?.role || "").toLowerCase() === "manager";
          setEmpCheck(isMgr ? "ok" : "missing");
          setEmpSource(isMgr ? "employees" : null);
        }
      } catch {
        if (alive) setEmpCheck("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid, storeId]);

  /* ---------- assignment ---------- */
  async function doAssign() {
    if (!uid || !storeId || !selTrainee || !selSupervisor) return;
    try {
      setStatus("Assigning…");
      await assignTrainee(storeId, selTrainee, selSupervisor);
      setStatus("Assigned ✓");
      setTimeout(() => setStatus(""), 1400);
    } catch (e: any) {
      console.error("assign error:", e);
      setStatus("Failed");
    }
  }

  const supCount = supervisors.length;
  const trnCount = trainees.length;

  /* ===========================================================
       MANAGER — TRAINEE PROGRESS (NEW)
     =========================================================== */

  const [mgrTraineeProgress, setMgrTraineeProgress] = useState<
    Record<
      string,
      { week: number; waiting: number; reviewed: number; approved: number }[]
    >
  >({});
  const [mgrLoadingProgress, setMgrLoadingProgress] = useState(true);

  useEffect(() => {
    if (!storeId || trainees.length === 0) return;

    let alive = true;

    (async () => {
      setMgrLoadingProgress(true);

      const result: Record<string, any[]> = {};

      for (const t of trainees) {
        const weeks: any[] = [];

        for (let w = 1; w <= 4; w++) {
          const snap = await getDocs(
            collection(db, "users", t.uid, "progress", `week${w}`)
          );

          let waiting = 0;
          let reviewed = 0;
          let approved = 0;

          snap.forEach((d) => {
            const status = (d.data() as any)?.status;
            if (status === "waiting") waiting++;
            else if (status === "reviewed") reviewed++;
            else if (status === "approved") approved++;
          });

          weeks.push({ week: w, waiting, reviewed, approved });
        }

        result[t.uid] = weeks;
      }

      if (alive) {
        setMgrTraineeProgress(result);
        setMgrLoadingProgress(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [storeId, trainees]);

  /* ===========================================================
     RENDER
     =========================================================== */

  if (!uid)
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold">Manager Dashboard</h1>
        <p>Please sign in.</p>
      </main>
    );

  if (loading)
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold">Manager Dashboard</h1>
        <p>Loading…</p>
      </main>
    );

  if (!storeId)
    return (
      <main className="p-8">
        <h1 className="text-xl font-bold">Manager Dashboard</h1>
        <p>No store assigned.</p>
      </main>
    );

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">

      {/* -------------------- TRAINEE WEEK OVERVIEW -------------------- */}
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="text-lg font-semibold mb-3">Trainee Weekly Progress</h2>

        {mgrLoadingProgress ? (
          <p className="text-sm text-gray-600">Loading trainee progress…</p>
        ) : trainees.length === 0 ? (
          <p className="text-sm text-gray-600">No trainees assigned yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {trainees.map((t) => (
              <div key={t.uid} className="border rounded-xl p-4 bg-white shadow-sm">
                <div className="font-semibold text-gray-900 mb-2">
                  {t.name || t.email || t.uid}
                </div>

                <div className="space-y-2 text-xs">
                  {mgrTraineeProgress[t.uid]?.map((wk) => (
                    <div key={wk.week}>
                      <div className="font-medium text-gray-800">Week {wk.week}</div>
                      <div className="flex gap-2 mt-1">
                        <span className="text-gray-600">
                          Waiting: {wk.waiting}
                        </span>
                        <span className="text-blue-600">
                          Reviewed: {wk.reviewed}
                        </span>
                        <span className="text-green-600">
                          Approved: {wk.approved}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <Link
                  href={`/manager/trainee/${t.uid}`}
                  className="text-blue-600 text-xs mt-3 inline-block hover:underline"
                >
                  View Details →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* STORE CARD */}
      {store && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[15px] font-semibold">
                Store #{store.number}
              </div>
              <div className="text-sm text-gray-700">{store.name}</div>
              <div className="text-sm text-gray-700">{store.address}</div>
            </div>

            <div className="inline-flex h-9 items-center rounded-full border px-3 text-sm text-gray-400 cursor-default">
              Store Loaded
            </div>
          </div>
        </section>
      )}

      {/* NOTES LINK */}
      <section className="rounded-2xl border bg-white p-5">
        <Link
          href={`/manager/notes?store=${storeId}`}
          className="grid grid-cols-[40px_1fr_auto] items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-gray-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v9Z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-gray-900">
              Notes & Messages
            </div>
            <div className="text-sm text-gray-600">
              Tap to view and send messages
            </div>
          </div>
          <span className="text-gray-500">→</span>
        </Link>
      </section>

      {/* STAFF COLLAPSE */}
      <section className="rounded-2xl border bg-white p-5">
        <button
          onClick={() => setOpenStaff(!openStaff)}
          className="grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 text-left"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-gray-700"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm-7 9a7 7 0 0 1 14 0Z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-gray-900">Store Staff</div>
            <div className="text-sm text-gray-600">
              Trainees, supervisors & employees
            </div>
          </div>
          <span className="text-gray-500">{openStaff ? "▲" : "▼"}</span>
        </button>

        {openStaff && (
          <div className="mt-6 space-y-8">

            {/* Supervisors */}
            <Block title="Supervisors">
              {supCount === 0 ? (
                "No supervisors yet."
              ) : (
                <ul className="text-sm">
                  {supervisors.map((p) => (
                    <li key={p.uid}>{p.name || p.email || p.uid}</li>
                  ))}
                </ul>
              )}
            </Block>

            {/* Trainees */}
            <Block title="Trainees">
              {trnCount === 0 ? (
                "No active trainees yet."
              ) : (
                <ul className="text-sm">
                  {trainees.map((p) => (
                    <li key={p.uid}>{p.name || p.email || p.uid}</li>
                  ))}
                </ul>
              )}
            </Block>

            {/* Employees */}
            <Block title="Employees">
              {everyone.length === 0 ? (
                "Loading…"
              ) : (
                <ul className="text-sm">
                  {everyone
                    .filter((e) => e.active)
                    .map((e) => (
                      <li key={e.uid}>
                        {e.name || e.email || e.uid} —{" "}
                        {String(e.role || "").toLowerCase()}
                      </li>
                    ))}
                </ul>
              )}
            </Block>

            {/* Assignment Section */}
            <section className="rounded-2xl border bg-white p-5">
              <h3 className="font-semibold mb-3">
                Assign Trainee → Supervisor
              </h3>

              {empCheck !== "ok" ? (
                <p className="text-sm text-gray-600">
                  You must be an <b>active manager</b> to assign.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm">
                      Trainee
                      <select
                        className="mt-1 block w-full rounded-md border p-2 text-sm"
                        value={selTrainee}
                        onChange={(e) => setSelTrainee(e.target.value)}
                      >
                        <option value="">Select trainee…</option>
                        {trainees.map((t) => (
                          <option key={t.uid} value={t.uid}>
                            {t.name || t.email || t.uid}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-sm">
                      Supervisor
                      <select
                        className="mt-1 block w-full rounded-md border p-2 text-sm"
                        value={selSupervisor}
                        onChange={(e) => setSelSupervisor(e.target.value)}
                      >
                        <option value="">Select supervisor…</option>
                        {supervisors.map((s) => (
                          <option key={s.uid} value={s.uid}>
                            {s.name || s.email || s.uid}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={doAssign}
                      disabled={!selTrainee || !selSupervisor}
                      className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
                    >
                      Assign
                    </button>
                    {status && (
                      <span className="text-sm text-gray-600">{status}</span>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

/* ---------- simple block ---------- */
function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-2xl bg-white p-5">
      <div className="font-semibold mb-2">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
