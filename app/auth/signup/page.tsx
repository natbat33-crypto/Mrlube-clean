"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
} from "firebase/firestore";

type Invite = {
  role: "admin" | "manager" | "supervisor" | "trainee" | "employee";
  storeId?: string | null;
  managerId?: string | null;
  used?: boolean;
  disabled?: boolean;
  expiresAt?: any;
  maxUses?: number;
  uses?: number;
};

/* 🔥 NEW — ADMIN DOMAIN CHECK */
function isAdminDomain(email?: string | null) {
  if (!email) return false;
  return email.toLowerCase().endsWith("@mrlubemb.com");
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const search = useSearchParams();
  const inviteParam = search.get("invite") || search.get("code") || "";
  const code = inviteParam.trim().toUpperCase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  /* ------------------ VALIDATE INVITE ------------------ */
  useEffect(() => {
    let cancel = false;

    (async () => {
      if (!code) return;

      try {
        const snap = await getDoc(doc(db, "invites", code));
        if (!snap.exists())
          return !cancel && setInviteError("Invalid invite code.");

        const inv = snap.data() as Invite;

        if (inv.disabled)
          return !cancel && setInviteError("Invite disabled.");

        if (inv.expiresAt?.toMillis && inv.expiresAt.toMillis() < Date.now())
          return !cancel && setInviteError("Invite expired.");

        if (typeof inv.maxUses === "number" && (inv.uses || 0) >= inv.maxUses)
          return !cancel && setInviteError("Invite quota reached.");

        if (!inv.maxUses && inv.used)
          return !cancel && setInviteError("Invite already used.");

        if (!cancel) setInviteError(null);
      } catch {
        if (!cancel) setInviteError("Could not read invite.");
      }
    })();

    return () => {
      cancel = true;
    };
  }, [code]);

  /* ------------------ SUBMIT ------------------ */
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (!email.includes("@")) {
      setStatus("❌ Please enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setStatus("❌ Password must be at least 6 characters.");
      return;
    }
    if (code && inviteError) {
      setStatus(`❌ ${inviteError}`);
      return;
    }

    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const uid = cred.user.uid;

      /* ---------- DEFAULTS ---------- */
      let role: Invite["role"] = "employee";
      let storeId: string | null = null;
      let managerId: string | null = null;

      const batch = writeBatch(db);

      /* 🔥 AUTO-ADMIN (NO INVITE REQUIRED) */
      if (!code && isAdminDomain(email)) {
        role = "admin";
        storeId = null;
      }

      /* ---------- APPLY INVITE ---------- */
      if (code) {
        const inviteRef = doc(db, "invites", code);
        const invSnap = await getDoc(inviteRef);
        if (!invSnap.exists()) throw new Error("Invalid invite code.");
        const inv = invSnap.data() as Invite;

        if (inv.disabled) throw new Error("Invite disabled.");
        if (inv.expiresAt?.toMillis && inv.expiresAt.toMillis() < Date.now())
          throw new Error("Invite expired.");
        if (typeof inv.maxUses === "number" && (inv.uses || 0) >= inv.maxUses)
          throw new Error("Invite quota reached.");
        if (!inv.maxUses && inv.used) throw new Error("Invite already used.");

        role = inv.role || "employee";
        storeId = role === "admin" ? null : inv.storeId ?? null;
        managerId = inv.managerId ?? null;

        batch.set(
          inviteRef,
          typeof inv.maxUses === "number"
            ? {
                uses: (inv.uses || 0) + 1,
                usedByLast: uid,
                usedAtLast: serverTimestamp(),
                disabled:
                  (inv.uses || 0) + 1 >= inv.maxUses
                    ? true
                    : inv.disabled ?? false,
              }
            : { used: true, usedBy: uid, usedAt: serverTimestamp() },
          { merge: true }
        );
      }

      /* ---------- ACTIVE RULE ---------- */
      const shouldBeActive =
        role === "admin" ||
        role === "manager" ||
        role === "supervisor" ||
        role === "trainee";

      /* ---------- USER DOC ---------- */
      batch.set(
        doc(db, "users", uid),
        {
          email: cred.user.email,
          role,
          storeId: storeId ?? null,
          managerId: managerId ?? null,
          active: shouldBeActive,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      /* ---------- STORE EMPLOYEE ---------- */
      if (storeId && role !== "admin") {
        batch.set(
          doc(db, `stores/${storeId}/employees/${uid}`),
          {
            uid,
            email: cred.user.email ?? null,
            role,
            storeId,
            active: shouldBeActive,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
      await sendEmailVerification(cred.user);
      await signOut(auth);

      window.location.assign("/auth/login?verify=1");
    } catch (err: any) {
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
    <main className="min-h-screen grid place-items-center bg-gray-50">
      <div className="w-[min(440px,92vw)] bg-white rounded-xl shadow-xl p-6">
        <h1 className="text-2xl font-bold mb-2">Employee Signup</h1>
        <p className="text-gray-600 mb-4">
          Create your Mr. Lube training account
        </p>

        <form onSubmit={onSubmit} className="grid gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="border rounded-lg p-3"
          />

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
