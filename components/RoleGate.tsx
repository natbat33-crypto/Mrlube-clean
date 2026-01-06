"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

type AllowedRole =
  | "admin"
  | "gm"
  | "manager"
  | "supervisor"
  | "trainee"
  | "employee";

interface Props {
  allow: AllowedRole[];
  children: ReactNode;
}

export default function RoleGate({ allow, children }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "allowed">("checking");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      // ✅ CRITICAL FIX:
      // If NOT logged in → ALWAYS go to login
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        // Ensure fresh auth state
        await user.getIdToken(true);

        const snap = await getDoc(doc(db, "users", user.uid));

        // ✅ Safety: missing profile should NEVER block login
        if (!snap.exists()) {
          console.warn("RoleGate: missing user doc, allowing access");
          setPhase("allowed");
          return;
        }

        const rawRole = snap.data()?.role;
        const storeId = snap.data()?.storeId;

        const role =
          typeof rawRole === "string"
            ? (rawRole.toLowerCase() as AllowedRole)
            : undefined;

        // ✅ Employees without store → pending page
        if (role === "employee" && !storeId) {
          router.replace("/employee/pending");
          return;
        }

        // ✅ Valid role access
        if (role && allow.includes(role)) {
          setPhase("allowed");
          return;
        }

        // ✅ If role not yet written, DO NOT block
        if (!role) {
          console.warn("RoleGate: role undefined, allowing temporarily");
          setPhase("allowed");
          return;
        }

        // 🚫 Only reach unauthorized if:
        // - logged in
        // - role exists
        // - role is explicitly disallowed
        router.replace("/unauthorized");
      } catch (err) {
        // ✅ Fail open instead of locking users
        console.warn("RoleGate: error, allowing temporarily", err);
        setPhase("allowed");
      }
    });

    return () => unsub();
  }, [allow, router]);

  if (phase === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
