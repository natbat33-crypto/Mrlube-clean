"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

type AllowedRole =
  | "admin"
  | "manager"
  | "supervisor"
  | "trainee"
  | "employee";

interface RoleGateProps {
  allow: AllowedRole[];
  children: ReactNode;
}

/**
 * SAFE CLIENT ROLE GATE:
 * • Never returns null unless redirecting
 * • Shows loader while calculating
 * • Guarantees no white screen
 */
export default function RoleGate({ allow, children }: RoleGateProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "allowed" | "denied">(
    "checking"
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setStatus("denied");
        router.replace("/auth/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const data = snap.exists() ? snap.data() : {};
        const role = data?.role;

        if (role && allow.includes(role)) {
          setStatus("allowed");
        } else {
          setStatus("denied");
          router.replace("/unauthorized");
        }
      } catch (err) {
        console.error("RoleGate error:", err);
        setStatus("denied");
        router.replace("/unauthorized");
      }
    });

    return () => unsub();
  }, [allow, router]);

  if (status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Checking access…
      </div>
    );
  }

  if (status === "denied") return null;

  return <>{children}</>;
}