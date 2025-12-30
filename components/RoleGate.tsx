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
        // Force fresh token (prevents stale role issues)
        await user.getIdToken(true);

        const snap = await getDoc(doc(db, "users", user.uid));

        // ⚠️ Missing user doc → allow temporarily (prevents lockouts)
        if (!snap.exists()) {
          console.warn("RoleGate: user doc missing, allowing temporarily");
          setPhase("allowed");
          return;
        }

        const rawRole = snap.data()?.role;
        const storeId = snap.data()?.storeId;

        const role = typeof rawRole === "string"
          ? (rawRole.toLowerCase() as AllowedRole)
          : undefined;

        // ✅ Fallback ONLY for unassigned employees
        if (role === "employee" && !storeId) {
          router.replace("/employee/pending");
          return;
        }

        // ✅ Allowed roles (manager + gm work identically)
        if (role && allow.includes(role)) {
          setPhase("allowed");
          return;
        }

        // ⚠️ Role undefined / slow write → allow temporarily
        if (!role) {
          console.warn("RoleGate: role undefined, allowing temporarily");
          setPhase("allowed");
          return;
        }

        // 🚫 Truly unauthorized
        router.replace("/unauthorized");
      } catch (err) {
        console.warn("RoleGate: temporary allow due to error", err);
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
