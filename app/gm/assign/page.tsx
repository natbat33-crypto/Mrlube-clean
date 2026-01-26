// app/gm/assign/page.tsx
"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";

/* ------------------------- Debug Badge ------------------------- */
function DebugBanner({ storeId }: { storeId: string }) {
  const [uid, setUid] = useState("");
  const [tokenStore, setTokenStore] = useState("");
  const [empOk, setEmpOk] = useState<null | boolean>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = auth.currentUser;
        setUid(u?.uid ?? "");
        const token = await u?.getIdTokenResult(true);
        setTokenStore(String(token?.claims?.storeId ?? ""));
        if (u?.uid && storeId) {
          const snap = await getDoc(doc(db, "stores", storeId, "employees", u.uid));
          setEmpOk(snap.exists());
        }
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    })();
  }, [storeId]);

  return (
    <div style={{
      position: "fixed", right: 12, top: 12,
      background: "rgba(0,0,0,0.7)", color: "#fff",
      padding: "8px 10px", borderRadius: 8, fontSize: 12, zIndex: 50
    }}>
      <div><b>Debug</b></div>
      <div>uid: {uid || "—"}</div>
      <div>token store: {tokenStore || "—"}</div>
      <div>query store: {storeId || "—"}</div>
      <div>
        employee doc: {empOk === null ? "…" : empOk ? "FOUND ✅" : "MISSING ❌"}
      </div>
      {err && <div style={{ color: "#ffd966" }}>err: {err}</div>}
    </div>
  );
}

/* ----------------------------- Component ----------------------------- */
type Employee = {
  uid: string;
  role?: string;
  active?: boolean;
  name?: string;
};

export default function GMAssignPage() {
  const sp = useSearchParams();
  const storeFromQuery = sp.get("store") || "";
  const [storeId, setStoreId] = useState(storeFromQuery);
  const [meOk, setMeOk] = useState<boolean | null>(null);

  /* -------- Load storeId from token if not in ?store= -------- */
  useEffect(() => {
    (async () => {
      if (storeFromQuery) return;
      const u = auth.currentUser;
      const tok = await u?.getIdTokenResult(true);
      const claimStore = String(tok?.claims?.storeId ?? "");
      if (claimStore) setStoreId(claimStore);
    })();
  }, [storeFromQuery]);

  /* -------- Check GM is employee of store -------- */
  useEffect(() => {
    (async () => {
      try {
        const u = auth.currentUser;
        if (!u || !storeId) {
          setMeOk(false);
          return;
        }
        const snap = await getDoc(doc(db, "stores", storeId, "employees", u.uid));
        setMeOk(snap.exists());
      } catch {
        setMeOk(false);
      }
    })();
  }, [storeId]);

  /* -------- Load supervisors + trainees -------- */
  const [supervisors, setSupervisors] = useState<Employee[]>([]);
  const [trainees, setTrainees] = useState<Employee[]>([]);

  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const base = collection(db, "stores", storeId, "employees");
      const qs = await getDocs(base);
      const all = qs.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as any),
      })) as Employee[];

      setSupervisors(all.filter((e) => e.active !== false && e.role === "supervisor"));
      setTrainees(all.filter((e) =>
        e.active !== false && (e.role === "trainee" || !e.role)
      ));
    })();
  }, [storeId]);

  const [traineeUid, setTraineeUid] = useState("");
  const [supervisorUid, setSupervisorUid] = useState("");
  const [status, setStatus] = useState("");

  const canSubmit = useMemo(
    () => !!storeId && !!traineeUid && !!supervisorUid && meOk === true,
    [storeId, traineeUid, supervisorUid, meOk]
  );

  /* --------------------- ASSIGN ACTION --------------------- */
  async function assign() {
    if (!canSubmit) return;

    const user = auth.currentUser;
    if (!user) {
      setStatus("❌ Not signed in");
      return;
    }

    setStatus("Assigning…");

    try {
      await setDoc(
        doc(db, "stores", storeId, "trainees", traineeUid),
        {
          storeId,
          traineeId: traineeUid,
          supervisorId: supervisorUid,
          active: true,
          createdBy: user.uid,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(doc(db, "users", traineeUid), {
        storeId,
        supervisorUid,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await setDoc(doc(db, "users", supervisorUid), {
        storeId,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setStatus("✅ Assigned");
    } catch (e: any) {
      setStatus(`❌ ${e.message ?? "Failed"}`);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
      <DebugBanner storeId={storeId} />

      {/* ⭐ NEW: Correct Back link */}
      <Link
        href="/gm"
        className="inline-block text-sm px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200"
      >
        ← Back to General Manager Dashboard
      </Link>

      <h1 className="text-2xl font-bold">General Manager — Assign Trainee</h1>

      {!storeId ? (
        <p className="text-sm text-gray-700">
          No store detected. Sign in or pass <code>?store=XX</code>.
        </p>
      ) : meOk === false ? (
        <p className="text-sm text-red-600">
          You are not an active employee of this store.
        </p>
      ) : (
        <>
          {/* Supervisor Pick */}
          <section className="space-y-2">
            <label className="text-sm font-medium">Supervisor</label>
            <select
              className="border rounded px-3 py-2 w-full bg-white"
              value={supervisorUid}
              onChange={(e) => setSupervisorUid(e.target.value)}
            >
              <option value="">Select supervisor…</option>
              {supervisors.map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.name ? `${s.name} — ` : ""}
                  {s.uid}
                </option>
              ))}
            </select>
          </section>

          {/* Trainee Pick */}
          <section className="space-y-2">
            <label className="text-sm font-medium">Trainee</label>
            <select
              className="border rounded px-3 py-2 w-full bg-white"
              value={traineeUid}
              onChange={(e) => setTraineeUid(e.target.value)}
            >
              <option value="">Select trainee…</option>
              {trainees.map((t) => (
                <option key={t.uid} value={t.uid}>
                  {t.name ? `${t.name} — ` : ""}
                  {t.uid}
                </option>
              ))}
            </select>
          </section>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={assign}
              disabled={!canSubmit}
              className={`px-4 py-2 rounded border ${
                canSubmit
                  ? "bg-black text-white"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed"
              }`}
            >
              Assign
            </button>
            <span className="text-sm text-gray-600">{status}</span>
          </div>
        </>
      )}
    </main>
  );
}
