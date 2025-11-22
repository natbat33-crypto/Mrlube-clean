// appp/manager/stores/[id]/page.tsx
"use client";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { onIdTokenChanged } from "firebase/auth";

import { clientAssignTrainee } from "@/lib/client-assign";

type Emp = {
  uid: string;
  role?: string;
  name?: string;
  email?: string;
  active?: boolean;
  storeId?: string | number;
};

type ManagerGate = {
  ok: boolean;
  source: "employees" | "roster" | null;
};

async function isActiveManagerForStore(storeId: string, uid: string): Promise<ManagerGate> {
  const empRef = doc(db, "stores", storeId, "employees", uid);
  const empSnap = await getDoc(empRef);

  if (empSnap.exists()) {
    const d = empSnap.data() as any;
    const role = String(d.role || d.title || "").toLowerCase();
    if (role === "manager" && d.active !== false) {
      return { ok: true, source: "employees" };
    }
  }

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

export default function ManagerStorePage() {
  const params = useParams<{ id: string }>();
  const storeId = String(params?.id || "");

  const [uid, setUid] = useState<string | null>(null);
  const [empCheck, setEmpCheck] = useState<"check" | "ok" | "missing" | "error">("check");
  const [empSource, setEmpSource] = useState<"employees" | "roster" | null>(null);

  const [supervisors, setSupervisors] = useState<Emp[]>([]);
  const [trainees, setTrainees] = useState<Emp[]>([]);
  const [everyone, setEveryone] = useState<Emp[]>([]);

  const [selTrainee, setSelTrainee] = useState<string>("");
  const [selSupervisor, setSelSupervisor] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const [debugOn, setDebugOn] = useState(false);

  useEffect(() => {
    const stop = onIdTokenChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => stop();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const d = new URLSearchParams(window.location.search).get("debug");
      setDebugOn(d === "1");
    }
  }, []);

  async function loadRole(role: string): Promise<Emp[]> {
    const coll = collection(db, "stores", storeId, "employees");
    try {
      const q1 = query(coll, where("active", "==", true), where("role", "==", role));
      const s1 = await getDocs(q1);
      let rows = s1.docs.map((d) => ({ uid: d.id, ...(d.data() as any) }));

      if (rows.length === 0) {
        const all = await getDocs(coll);
        rows = all.docs
          .map((d) => ({ uid: d.id, ...(d.data() as any) }))
          .filter(
            (e) =>
              e.active === true && String(e.role || "").toLowerCase() === role
          );
      }
      return rows;
    } catch {
      const all = await getDocs(coll);
      return all.docs
        .map((d) => ({ uid: d.id, ...(d.data() as any) }))
        .filter(
          (e) =>
            e.active === true && String(e.role || "").toLowerCase() === role
        );
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!uid || !storeId) return;

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
          const isMgr = me?.active && String(me?.role || "").toLowerCase() === "manager";
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

  // ⭐ FIX — PREVENTS PROD WHITE SCREEN
  if (!storeId || empCheck === "check" ||
      (supervisors.length === 0 && trainees.length === 0 && everyone.length === 0)) {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <p className="text-sm text-gray-600">Loading store data…</p>
      </main>
    );
  }
  // ⭐ END FIX

  if (!uid) {
    return (
      <main className="max-w-4xl mx-auto p-4">
        <p className="text-sm text-gray-600">Loading manager dashboard…</p>
      </main>
    );
  }

  async function assign() {
    if (!uid || !storeId || !selTrainee || !selSupervisor) return;
    try {
      setStatus("Assigning…");
      await clientAssignTrainee(storeId, selTrainee, selSupervisor);
      setStatus("Assigned ✓");
      setTimeout(() => setStatus(""), 1400);
    } catch (e: any) {
      console.error("assign error:", e.code, e.message);
      setStatus("Failed");
    }
  }

  const mgrCount = useMemo(
    () =>
      everyone.filter((e) => e.active && String(e.role || "").toLowerCase() === "manager").length,
    [everyone]
  );

  const supCount = useMemo(() => supervisors.length, [supervisors]);
  const trnCount = useMemo(() => trainees.length, [trainees]);

  return (
    <main className="max-w-4xl mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Store Details</h1>
        <Link
          href="/manager"
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {debugOn && (
        <div className="text-xs text-gray-500">
          Debug: store <b>{storeId}</b> • employees <b>{everyone.length}</b> • mgr{" "}
          <b>{mgrCount}</b> • sup <b>{supCount}</b> • trn <b>{trnCount}</b> • auth{" "}
          <b>{uid ? "yes" : "no"}</b> • managerGate{" "}
          <b>
            {empCheck}
            {empSource ? `:${empSource}` : ""}
          </b>
        </div>
      )}

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

      <Block title="Employees">
        {everyone.length === 0 ? (
          "Loading…"
        ) : (
          <ul className="text-sm">
            {everyone
              .filter((e) => e.active)
              .map((e) => (
                <li key={e.uid}>
                  {e.name || e.email || e.uid} — {String(e.role || "").toLowerCase()}
                </li>
              ))}
          </ul>
        )}
      </Block>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h3 className="font-semibold mb-3">Assign Trainee → Supervisor</h3>

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
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
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
                  className="mt-1 block w-full rounded-md border border-gray-300 bg-white p-2 text-sm"
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
                onClick={assign}
                disabled={!selTrainee || !selSupervisor}
                className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                Assign
              </button>
              {status && <span className="text-sm text-gray-600">{status}</span>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-2xl bg-white p-5">
      <div className="font-semibold mb-2">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
