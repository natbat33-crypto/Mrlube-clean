"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const [phase, setPhase] = useState<"checking" | "allowed">("checking");

  // ✅ PUBLIC ROUTES — RoleGate must NEVER run here
  const isPublicRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth");

  useEffect(() => {
    // ✅ If public route, bypass RoleGate entirely
    if (isPublicRoute) {
      setPhase("allowed");
      return;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      // ✅ Not logged in → go to login (never unauthorized)
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        await user.getIdToken(true);

        const snap = await getDoc(doc(db, "users", user.uid));

        // Missing profile → allow temporarily
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

        // Employees without store
        if (role === "employee" && !storeId) {
          router.replace("/employee/pending");
          return;
        }

        // Allowed roles
        if (role && allow.includes(role)) {
          setPhase("allowed");
          return;
        }

        // Role not written yet → fail open
        if (!role) {
          console.warn("RoleGate: role undefined, allowing temporarily");
          setPhase("allowed");
          return;
        }

        // 🚫 Unauthorized ONLY after login + role check
        router.replace("/unauthorized");
      } catch (err) {
        console.warn("RoleGate: error, allowing temporarily", err);
        setPhase("allowed");
      }
    });

    return () => unsub();
  }, [allow, router, isPublicRoute]);

  if (phase === "checking") {
    return (
      <div className="min-h-[100svh] flex items-center justify-center text-gray-500">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
