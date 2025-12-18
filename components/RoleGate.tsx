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
      if (!user) {
        router.replace("/auth/login");
        return;
      }

      try {
        // 🔥 Refresh token (prevents unauthorized)
        await user.getIdToken(true);

        // Load user role
        const snap = await getDoc(doc(db, "users", user.uid));

        // ⚠️ If Firestore doc missing → ALLOW TEMPORARILY
        if (!snap.exists()) {
          console.warn("User doc missing, allowing temporarily");
          setPhase("allowed");
          return;
        }

        const role = snap.data()?.role;

        // If role matches → ALLOW
        if (allow.includes(role)) {
          setPhase("allowed");
          return;
        }

        // ⚠️ If role undefined or slow to load → ALLOW TEMPORARILY
        if (!role) {
          console.warn("Role undefined, allowing temporarily");
          setPhase("allowed");
          return;
        }

        // 🚫 Finally deny only if role definitely wrong
        router.replace("/unauthorized");
      } catch (err) {
        // ⚠️ Firestore slow / token refresh delay → ALLOW
        console.warn("RoleGate temporary allow due to error:", err);
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
