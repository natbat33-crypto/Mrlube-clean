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

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center">Loading…</div>}>
      <SignupContent />
    </Suspense>
  );
}

function SignupContent() {
  const search = useSearchParams();

  // 🔥 NEW — supports BOTH ?invite=XYZ and ?code=XYZ
  const inviteParam = search.get("invite") || search.get("code") || "";
  const code = inviteParam.trim().toUpperCase();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // ------------------ VALIDATE INVITE ------------------
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

  // ------------------ SUBMIT ------------------
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

      // Defaults
      let role: Invite["role"] = "employee";
      let storeId: string | null = null;
      let managerId: string | null = null;

      const batch = writeBatch(db);

      // ---------- APPLY INVITE CLAIM ----------
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

        // Update invite usage
        batch.set(
          inviteRef,
          typeof inv.maxUses === "number"
            ? {
                uses: (inv.uses || 0) + 1,
                usedByLast: uid,
                usedAtLast: serverTimestamp(),
                disabled:
                  ((inv.uses || 0) + 1) >= inv.maxUses
                    ? true
                    : inv.disabled ?? false,
              }
            : { used: true, usedBy: uid, usedAt: serverTimestamp() },
          { merge: true }
        );
      }

      // If no manager specified, fetch store's manager
      if (!managerId && storeId && (role === "trainee" || role === "supervisor")) {
        const sid = String(storeId);
        const storeRef = doc(db, "stores", sid);
        const storeSnap = await getDoc(storeRef);
        if (storeSnap.exists()) {
          const s = storeSnap.data() as any;
          managerId =
            s.managerUid ??
            (Array.isArray(s.managerUids) && s.managerUids.length > 0
              ? String(s.managerUids[0])
              : null);
        }
      }

      const shouldBeActive =
        role === "manager" || role === "supervisor" || role === "trainee";

      // ---------- CREATE USER DOC ----------
      batch.set(
        doc(db, "users", uid),
        {
          email: cred.user.email,
          role,
          storeId: storeId ?? null,
          managerId: managerId ?? null,
          active: shouldBeActive ? true : false,
          startDate: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // ---------- STORE EMPLOYEE RECORDS ----------
      if (storeId) {
        const sid = String(storeId);

        // employees subcollection
        if (role === "manager" || role === "supervisor" || role === "trainee") {
          batch.set(
            doc(db, `stores/${sid}/employees/${uid}`),
            {
              uid,
              email: cred.user.email ?? null,
              role,
              storeId: sid,
              active: true,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        // trainees subcollection
        if (role === "trainee") {
          batch.set(
            doc(db, `stores/${sid}/trainees/${uid}`),
            {
              traineeId: uid,
              traineeEmail: cred.user.email ?? null,
              storeId: sid,
              active: true,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      }

      // ---------- SAVE ----------
      await batch.commit();
      await sendEmailVerification(cred.user);
      await signOut(auth);

      window.location.assign("/auth/login?verify=1");
    } catch (err: any) {
      const c = String(err?.code || "");
      let msg = err?.message || "❌ Something went wrong. Please try again.";
      if (c.includes("email-already-in-use"))
        msg = "❌ That email is already in use.";
      else if (c.includes("invalid-email"))
        msg = "❌ Please enter a valid email.";
      else if (c.includes("weak-password"))
        msg = "❌ Weak password.";
      setStatus(msg);
    } finally {
      setLoading(false);
    }
  }

  // ------------------ UI ------------------
  const blue = "#0b53a6";
  const blueHover = "#094a92";
  const border = "#e5e7eb";
  const textMuted = "#556070";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f6f8fb",
      }}
    >
      <div
        style={{
          width: "min(440px, 92vw)",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <span
            style={{
              background: blue,
              color: "#fff",
              fontWeight: 800,
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              letterSpacing: 0.2,
            }}
          >
            Mr. Lube
          </span>
          <span
            style={{
              background: "#f2b705",
              color: "#1b1b1b",
              fontWeight: 800,
              borderRadius: 999,
              padding: "6px 12px",
              fontSize: 12,
              letterSpacing: 0.2,
            }}
          >
            Training
          </span>
        </div>

        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            margin: "6px 0 4px",
            color: "#111827",
          }}
        >
          Employee Signup
        </h1>
        <p style={{ color: textMuted, marginBottom: 18 }}>
          Create your Mr. Lube training account
        </p>

        <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
          <label
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "#111827",
            }}
          >
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              required
              autoComplete="email"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${border}`,
                outline: "none",
              }}
            />
          </label>

          <label
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: "#111827",
            }}
          >
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              required
              autoComplete="new-password"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "12px 14px",
                borderRadius: 10,
                border: `1px solid ${border}`,
                outline: "none",
              }}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              background: blue,
              color: "#fff",
              fontWeight: 800,
              border: "none",
              borderRadius: 10,
              padding: "12px 18px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.75 : 1,
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                blueHover;
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = blue;
            }}
          >
            {loading ? "Creating…" : "Sign Up"}
          </button>
        </form>

        {status && (
          <p
            style={{
              marginTop: 12,
              color: status.startsWith("❌") ? "#b00020" : "#137333",
              fontSize: 14,
            }}
          >
            {status}
          </p>
        )}

        <p
          style={{
            marginTop: 16,
            color: textMuted,
            fontSize: 14,
            textAlign: "center",
          }}
        >
          Already have an account?{" "}
          <a href="/auth/login" style={{ color: blue, fontWeight: 700 }}>
            Log in
          </a>
        </p>
      </div>
    </main>
  );
}
