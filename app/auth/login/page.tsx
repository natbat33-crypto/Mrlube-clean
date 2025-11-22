"use client";

import { Suspense } from "react";
import { useState, FormEvent, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

type UserProfile = {
  email?: string;
  role?: string;
  storeId?: string | null;
  storeid?: string | null;
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const qs = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (qs?.get("verify") === "1") {
      setMsg("Check your email to verify your account, then sign in.");
    }
  }, [qs]);

  async function ensureUserDoc(uid: string, emailForDoc: string): Promise<UserProfile | undefined> {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      await setDoc(
        ref,
        {
          email: emailForDoc,
          role: "trainee",
          storeId: null,
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );
      const created = await getDoc(ref);
      return created.data() as UserProfile | undefined;
    }

    return snap.data() as UserProfile | undefined;
  }

  async function routeByProfile(uid: string, emailForDoc: string) {
    const data = await ensureUserDoc(uid, emailForDoc);

    const rawRole = (data?.role || "trainee").toString().toLowerCase();
    const role = rawRole.trim();
    const storeId =
      (data?.storeId as string | null | undefined) ??
      ((data as any)?.storeid as string | null | undefined) ??
      null;

    if (role === "admin") {
      router.replace("/admin");
      return;
    }

    if (role === "manager") {
      if (storeId) {
        router.replace(`/manager/stores/${storeId}`);
      } else {
        router.replace("/manager");
      }
      return;
    }

    if (role === "supervisor") {
      router.replace("/supervisor");
      return;
    }

    if (role === "trainee" || role === "employee") {
      router.replace("/dashboard");
      return;
    }

    router.replace("/dashboard");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const u = cred.user;

      await u.reload();
      if (!u.emailVerified) {
        setMsg("❌ Please verify your email first. We just need that one-time confirmation.");
        await signOut(auth);
        return;
      }

      await u.getIdToken(true);

      await routeByProfile(u.uid, u.email || email);
    } catch (err: any) {
      const text =
        err?.code === "auth/invalid-credential"
          ? "❌ Invalid email or password."
          : err?.message || "Login failed.";
      setMsg(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-6 sm:p-8">
        <div className="flex items-center justify-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#0b3d91] px-3 py-1 text-white font-semibold">
            Mr. Lube
          </span>
          <span className="inline-flex items-center rounded-full bg-[#f2b705] px-3 py-1 text-[#1b1b1b] font-semibold">
            Training
          </span>
        </div>

        <h1 className="mt-6 text-center text-2xl sm:text-3xl font-bold text-[#0b3d91]">
          Welcome Back
        </h1>
        <p className="mt-1 text-center text-slate-500">
          Sign in to access your Mr. Lube training
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0b3d91] focus:border-transparent bg-slate-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0b3d91] focus:border-transparent bg-slate-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#0b3d91] text-white py-2.5 font-semibold disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          {msg && (
            <p className="text-sm mt-2 text-center text-red-600" role="alert">
              {msg}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

