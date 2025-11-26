"use client";

import { useEffect, useMemo, useState } from "react";
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

/* ===========================================================
   CLEAN RESTORED MANAGER DASHBOARD
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

  /* ---------- load role groups ---------- */
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
      } catch {}
    })();

    return () => {
      alive = false;
    };
  }, [uid, storeId]);

  /* ---------- assign trainee ---------- */
  async function doAssign() {
    if (!uid || !storeId || !selTrainee || !selSupervisor) return;

    try {
      setStatus("Assigning…");
      await assignTrainee(storeId, selTrainee, selSupervisor);
      setStatus("Assigned ✓");
      setTimeout(() => setStatus(""), 1500);
    } catch {
      setStatus("Failed");
    }
  }

  /* ---------- RENDER ---------- */
  if (!uid)
    return <main className="p-8">Please sign in.</main>;

  if (loading)
    return <main className="p-8">Loading…</main>;

  if (!storeId)
    return <main className="p-8">No store assigned.</main>;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">

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

      {/* NOTES */}
      <section className="rounded-2xl border bg-white p-5">
        <Link
          href={`/manager/notes?store=${storeId}`}
          className="flex items-center gap-3"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white">
            💬
          </div>
          <div>
            <div className="font-semibold text-gray-900">Notes & Messages</div>
            <div className="text-sm text-gray-600">
              Tap to view and send messages
            </div>
          </div>
        </Link>
      </section>

      {/* STAFF SECTION */}
      <section className="rounded-2xl border bg-white p-5">
        <button
          className="w-full flex justify-between items-center"
          onClick={() => setOpenStaff(!openStaff)}
        >
          <div className="font-semibold text-gray-900">
            Store Staff
          </div>
          <span className="text-gray-500">{openStaff ? "▲" : "▼"}</span>
        </button>

        {openStaff && (
          <div className="mt-5 space-y-6">

            <Block title="Supervisors">
              {supervisors.length === 0
                ? "No supervisors yet."
                : supervisors.map((p) => (
                    <div key={p.uid}>{p.name || p.email}</div>
                  ))}
            </Block>

            <Block title="Trainees">
              {trainees.length === 0
                ? "No trainees yet."
                : trainees.map((p) => (
                    <div key={p.uid}>{p.name || p.email}</div>
                  ))}
            </Block>

            <Block title="Employees">
              {everyone.length === 0
                ? "Loading…"
                : everyone
                    .filter((e) => e.active)
                    .map((e) => (
                      <div key={e.uid}>
                        {e.name || e.email} — {String(e.role || "").toLowerCase()}
                      </div>
                    ))}
            </Block>

            {/* ASSIGN */}
            <section className="border rounded-2xl bg-white p-5">
              <h3 className="font-semibold mb-3">Assign Trainee → Supervisor</h3>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm">
                  Trainee
                  <select
                    value={selTrainee}
                    onChange={(e) => setSelTrainee(e.target.value)}
                    className="mt-1 block w-full border rounded-md p-2 text-sm"
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
                  Supervisor
                  <select
                    value={selSupervisor}
                    onChange={(e) => setSelSupervisor(e.target.value)}
                    className="mt-1 block w-full border rounded-md p-2 text-sm"
                  >
                    <option value="">Select supervisor…</option>
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
                  className="border px-3 py-1 rounded text-sm hover:bg-gray-50"
                >
                  Assign
                </button>
                {status && <span className="text-sm text-gray-600">{status}</span>}
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function Block({ title, children }: { title: string; children: any }) {
  return (
    <div className="border rounded-2xl bg-white p-5">
      <div className="font-semibold mb-2">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
