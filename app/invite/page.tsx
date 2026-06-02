"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "firebase/auth";

import {
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";

export default function InviteSignupPage() {
  const params = useParams();
  const token = String(params.token || "");

  const [invite, setInvite] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [storeId, setStoreId] = useState("");
  const [status, setStatus] = useState<string | null>("Loading invite…");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadInvite() {
      try {
        const inviteRef = doc(db, "invites", token);
        const snap = await getDoc(inviteRef);

        if (!snap.exists()) {
          setStatus("❌ Invalid invite link.");
          return;
        }

        const data = snap.data();

        if (data.used) {
          setStatus("❌ This invite has already been used.");
          return;
        }

        setInvite(data);
        if (data.email) setEmail(data.email);
        setStatus(null);
      } catch (err) {
        console.error(err);
        setStatus("❌ Could not load invite.");
      }
    }

    if (token) loadInvite();
  }, [token]);

  useEffect(() => {
    async function loadStores() {
      const snap = await getDocs(collection(db, "stores"));
      const arr: any[] = [];

      snap.forEach((d) => {
        arr.push({
          id: d.id,
          name: d.data().name || d.id,
        });
      });

      setStores(arr);
    }

    loadStores();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!invite) return setStatus("❌ Invalid invite.");
    if (!name.trim()) return setStatus("❌ Enter your full name.");
    if (!email.includes("@")) return setStatus("❌ Invalid email.");
    if (password.length < 6)
      return setStatus("❌ Password must be at least 6 characters.");

    const role = invite.role;

    if (role !== "admin" && !storeId) {
      return setStatus("❌ Please select your store.");
    }

    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const uid = cred.user.uid;
      const batch = writeBatch(db);

      batch.set(
        doc(db, "users", uid),
        {
          uid,
          name: name.trim(),
          email: email.trim(),
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
            email: email.trim(),
            role,
            storeId,
            active: true,
            inviteToken: token,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();

      await updateDoc(doc(db, "invites", token), {
        used: true,
        usedBy: uid,
        usedAt: serverTimestamp(),
      });

      await sendEmailVerification(cred.user);
      await signOut(auth);

      window.location.assign("/auth/login?verify=1");
    } catch (err: any) {
      console.error("Invite signup error:", err);
      let m = err?.message || "❌ Something went wrong.";
      if (String(err?.code).includes("email-already-in-use")) {
        m = "❌ Email already in use.";
      }
      setStatus(m);
    } finally {
      setLoading(false);
    }
  }

  if (status && !invite) {
    return (
      <main className="min-h-[100svh] grid place-items-center bg-gray-50">
        <div className="bg-white rounded-xl shadow-xl p-6 w-[min(440px,92vw)]">
          <p className="text-center">{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] grid place-items-center bg-gray-50">
      <div className="w-[min(440px,92vw)] bg-white rounded-xl shadow-xl p-6">
        <h1 className="text-2xl font-bold mb-2">Accept Invite</h1>
        <p className="text-gray-600 mb-4">
          Create your account for role: <b>{invite?.role}</b>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="border rounded-lg p-3"
            required
            disabled={!!invite?.email}
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