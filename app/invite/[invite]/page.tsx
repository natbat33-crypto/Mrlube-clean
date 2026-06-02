"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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

export default function InviteSignupPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <InviteSignupContent />
    </Suspense>
  );
}

function InviteSignupContent() {
  const params = useParams();

const token = Array.isArray(params.token)
  ? params.token[0]
  : (params.token as string) || "";

  const [invite, setInvite] = useState<any>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState<string | null>("Loading invite…");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
  if (!token) {
    setStatus("❌ Missing invite token.");
    return;
  }

  async function loadInvite() {
    try {
      const snap = await getDoc(doc(db, "invites", token));

      if (!snap.exists()) {
        setStatus("❌ Invalid invite link.");
        return;
      }

      const data = snap.data();

      if (data.disabled) {
        setStatus("❌ Invite disabled.");
        return;
      }

      if (data.used) {
        setStatus("❌ Invite already used.");
        return;
      }

      if (!data.email || !data.role) {
        setStatus("❌ Invite missing email or role.");
        return;
      }

      setInvite(data);
      setStatus(null);
    } catch (e) {
      console.error("Invite load error:", e);
      setStatus("❌ Could not load invite.");
    }
  }

  loadInvite();
}, [token]);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!invite) return setStatus("❌ Invalid invite.");
    if (!name.trim()) return setStatus("❌ Enter your full name.");
    if (password.length < 6)
      return setStatus("❌ Password must be at least 6 characters.");

    const email = String(invite.email).trim().toLowerCase();
    const role = String(invite.role).trim().toLowerCase();

    if (role !== "admin" && !storeId)
      return setStatus("❌ Please select your store.");

    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;

      const batch = writeBatch(db);

      batch.set(
        doc(db, "users", uid),
        {
          uid,
          name: name.trim(),
          email,
          role,
          storeId: role === "admin" ? null : storeId,
          active: true,
          inviteToken: token,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (role !== "admin") {
        batch.set(
          doc(db, `stores/${storeId}/employees/${uid}`),
          {
            uid,
            name: name.trim(),
            email,
            role,
            storeId,
            active: true,
            inviteToken: token,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      batch.set(
        doc(db, "invites", token),
        {
          used: true,
          usedBy: uid,
          usedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      await sendEmailVerification(cred.user);
      await signOut(auth);

      window.location.assign("/auth/login?verify=1");
    } catch (err: any) {
      console.error("Invite signup error:", err);
      let m = err?.message || "❌ Something went wrong.";
      if (String(err?.code).includes("email-already-in-use"))
        m = "❌ Email already in use.";
      setStatus(m);
    } finally {
      setLoading(false);
    }
  }

  if (status && !invite) {
    return (
      <main className="min-h-[100svh] grid place-items-center bg-gray-50">
        <div className="w-[min(440px,92vw)] bg-white rounded-xl shadow-xl p-6 text-center">
          {status}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] grid place-items-center bg-gray-50">
      <div className="w-[min(440px,92vw)] bg-white rounded-xl shadow-xl p-6">
        <h1 className="text-2xl font-bold mb-2">Accept Invite</h1>
        <p className="text-gray-600 mb-4">
          Create your account as <b>{invite?.role}</b>
        </p>

        <form onSubmit={onSubmit} className="grid gap-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full Name"
            className="border rounded-lg p-3"
            required
          />

          {invite?.role !== "admin" && (
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
            value={invite?.email || ""}
            className="border rounded-lg p-3 bg-gray-100"
            disabled
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
            {loading ? "Creating…" : "Create Account"}
          </button>
        </form>

        {status && <p className="mt-3 text-sm text-red-600">{status}</p>}
      </div>
    </main>
  );
}