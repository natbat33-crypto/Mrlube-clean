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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [accessCode, setAccessCode] = useState("");
  const [role, setRole] = useState("");

  const [accessCodes, setAccessCodes] = useState<any>(null);

  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState("");

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // LOAD ACCESS CODES
  useEffect(() => {
    async function loadCodes() {
      try {
        const snap = await getDoc(doc(db, "config", "accessCodes"));
        if (snap.exists()) setAccessCodes(snap.data());
      } catch (e) {
        console.error("Access code load error:", e);
      }
    }
    loadCodes();
  }, []);

  // LOAD STORES
  useEffect(() => {
    async function loadStores() {
      try {
        const snap = await getDocs(collection(db, "stores"));
        const arr: any[] = [];
        snap.forEach((d) => {
          arr.push({
            id: d.id,
            name: d.data().name || d.id,
          });
        });
        setStores(arr);
      } catch (e) {
        console.error("Store load error:", e);
      }
    }

    loadStores();
  }, []);

  // DETECT ROLE FROM ACCESS CODE
  useEffect(() => {
    if (!accessCodes) return;

    const code = accessCode.trim().toUpperCase();

    if (code === accessCodes.admin?.toUpperCase()) setRole("admin");
    else if (code === accessCodes.gm?.toUpperCase()) setRole("gm");
    else if (code === accessCodes.manager?.toUpperCase()) setRole("manager");
    else if (code === accessCodes.employee?.toUpperCase()) setRole("employee");
    else setRole("");
  }, [accessCode, accessCodes]);

  // SUBMIT
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!name.trim()) return setStatus("❌ Enter your full name.");
    if (!email.includes("@")) return setStatus("❌ Invalid email.");
    if (password.length < 6)
      return setStatus("❌ Password must be at least 6 characters.");
    if (!role) return setStatus("❌ Invalid access code.");
    if (role !== "admin" && !storeId)
      return setStatus("❌ Please select your store.");

    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const uid = cred.user.uid;

      const batch = writeBatch(db);

      // USER DOC
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

      // STORE EMPLOYEE DOC
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

      await batch.commit();
      await sendEmailVerification(cred.user);
      await signOut(auth);

      // ✅ FIXED REDIRECT — DO NOT TOUCH
      window.location.assign("/login?verify=1");

    } catch (err: any) {
      console.error("Signup error:", err);
      let m = err?.message || "❌ Something went wrong.";
      if (String(err?.code).includes("email-already-in-use"))
        m = "❌ Email already in use.";
      setStatus(m);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-[100svh] grid place-items-center bg-gray-50">
      <div className="w-[min(440px,92vw)] bg-white rounded-xl shadow-xl p-6">
        <h1 className="text-2xl font-bold mb-2">Create Account</h1>
        <p className="text-gray-600 mb-4">Enter your details to get started</p>

        <form onSubmit={onSubmit} className="grid gap-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full Name"
            className="border rounded-lg p-3"
            required
          />

          <input
            type="text"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="Access Code"
            className="border rounded-lg p-3"
            required
          />

          {role && role !== "admin" && (
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="border rounded-lg p-3"
              required
            >
              <option value="">Select Your Store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.name}
                </option>
              ))}
            </select>
          )}

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="border rounded-lg p-3"
            required
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="border rounded-lg p-3"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-700 text-white rounded-lg py-3 font-bold"
          >
            {loading ? "Creating…" : "Sign Up"}
          </button>
        </form>

        {status && <p className="mt-3 text-sm text-red-600">{status}</p>}
      </div>
    </main>
  );
}
