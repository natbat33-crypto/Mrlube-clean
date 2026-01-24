"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";

import {
  doc,
  serverTimestamp,
  getDoc,
  writeBatch,
  collection,
  getDocs,
} from "firebase/firestore";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  /* ---------------- STATE ---------------- */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [accessCode, setAccessCode] = useState("");
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /* -------------- LOAD STORES (store numbers) -------------- */
  useEffect(() => {
    async function loadStores() {
      try {
        const colRef = collection(db, "stores");
        const snaps = await getDocs(colRef);
        const arr: any[] = [];

        snaps.forEach((d) => {
          arr.push({ id: d.id, ...d.data() }); // id === store number
        });

        setStores(arr);
      } catch (err) {
        console.error("Store load error:", err);
      }
    }

    loadStores();
  }, []);

  /* ------------------ SUBMIT ------------------ */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!name.trim()) {
      setStatus("❌ Please enter your full name.");
      return;
    }

    if (!email.includes("@")) {
      setStatus("❌ Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setStatus("❌ Password must be at least 6 characters.");
      return;
    }

    if (!accessCode.trim()) {
      setStatus("❌ Please enter your access code.");
      return;
    }

    setLoading(true);

    try {
      /* ---------- 1. FETCH ACCESS CODES ---------- */
      const accessSnap = await getDoc(doc(db, "config", "accessCodes"));
      if (!accessSnap.exists()) {
        setStatus("❌ Server error: no access codes found.");
        setLoading(false);
        return;
      }

      const codes = accessSnap.data();

      /* ---------- 2. DETERMINE ROLE FROM CODE ---------- */
      let role = "";
      if (accessCode === codes.admin) role = "admin";
      else if (accessCode === codes.gm) role = "gm";
      else if (accessCode === codes.manager) role = "manager";
      else if (accessCode === codes.employee) role = "employee";
      else {
        setStatus("❌ Invalid access code.");
        setLoading(false);
        return;
      }

      /* ---------- 3. REQUIRE STORE FOR NON-ADMINS ---------- */
      if (role !== "admin" && !storeId) {
        setStatus("❌ Please select your store.");
        setLoading(false);
        return;
      }

      /* ---------- 4. CREATE FIREBASE AUTH USER ---------- */
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const uid = cred.user.uid;

      const batch = writeBatch(db);

      /* ---------- 5. USER DOC ---------- */
      batch.set(
        doc(db, "users", uid),
        {
          uid,
          name,
          email,
          role,
          storeId: role === "admin" ? null : storeId,
          active: true,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      /* ---------- 6. STORE EMPLOYEE DOC ---------- */
      if (role !== "admin") {
        batch.set(
          doc(db, `stores/${storeId}/employees/${uid}`),
          {
            uid,
            name,
            email,
            role,
            storeId,
            active: true,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      /* ---------- 7. SAVE + SEND VERIFICATION ---------- */
      await batch.commit();
      await sendEmailVerification(cred.user);
      await signOut(auth);

      window.location.assign("/login?verify=1");
    } catch (err: any) {
      console.error(err);

      let msg = err?.message || "❌ Something went wrong.";

      if (String(err?.code).includes("email-already-in-use"))
        msg = "❌ That email is already in use.";

      setStatus(msg);
    } finally {
      setLoading(false);
    }
  }

  /* ------------------ UI ------------------ */
  return (
    <main className="min-h-[100svh] grid place-items-center bg-gray-50">
      <div className="w-[min(440px,92vw)] bg-white rounded-xl shadow-xl p-6">
        <h1 className="text-2xl font-bold mb-2">Create Account</h1>
        <p className="text-gray-600 mb-4">Enter your details to get started</p>

        <form onSubmit={onSubmit} className="grid gap-4">

          {/* NAME */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full Name"
            required
            className="border rounded-lg p-3"
          />

          {/* ACCESS CODE */}
          <input
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="Access Code"
            required
            className="border rounded-lg p-3"
          />

          {/* STORE DROPDOWN — ONLY FOR NON ADMINS */}
          {accessCode !== "" && accessCode !== "ADMIN-2026" && (
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="border rounded-lg p-3"
            >
              <option value="">Select Your Store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}
                </option>
              ))}
            </select>
          )}

          {/* EMAIL */}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="border rounded-lg p-3"
          />

          {/* PASSWORD */}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="border rounded-lg p-3"
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white rounded-lg py-3 font-bold"
          >
            {loading ? "Creating…" : "Sign Up"}
          </button>
        </form>

        {status && (
          <p className="mt-3 text-sm text-red-600">{status}</p>
        )}
      </div>
    </main>
  );
}
