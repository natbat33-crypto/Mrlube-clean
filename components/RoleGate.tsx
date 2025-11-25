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

// 🚨 Hard fail-safe timeouts
const FIREBASE_TIMEOUT = 8000; // 8 seconds max wait

export default function RoleGate({ allow, children }: RoleGateProps) {
  const router = useRouter();

  const [state, setState] = useState<{
    phase: "loading" | "allowed" | "denied";
    tried: number;
  }>({
    phase: "loading",
    tried: 0,
  });

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    let unsub: (() => void) | null = null;

    const load = () => {
      unsub = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setState({ phase: "denied", tried: 1 });
          router.replace("/auth/login");
          return;
        }

        try {
          // Firestore user doc
          const snap = await getDoc(doc(db, "users", user.uid));

          if (!snap.exists()) {
            // If doc hasn't synced yet but auth is valid → retry once
            if (state.tried < 2) {
              setState({ phase: "loading", tried: state.tried + 1 });
              return load();
            }
            setState({ phase: "denied", tried: 2 });
            router.replace("/unauthorized");
            return;
          }

          const role = snap.data()?.role;

          if (role && allow.includes(role)) {
            setState({ phase: "allowed", tried: 3 });
          } else {
            setState({ phase: "denied", tried: 3 });
            router.replace("/unauthorized");
          }
        } catch (e) {
          // If Firestore temporarily fails → retry once
          if (state.tried < 2) {
            setState({ phase: "loading", tried: state.tried + 1 });
            return load();
          }

          console.error("RoleGate Error:", e);
          setState({ phase: "denied", tried: 3 });
          router.replace("/unauthorized");
        }
      });

      // Absolute safety fail: avoid infinite loading if Firebase stalls
      timeout = setTimeout(() => {
        if (state.phase === "loading") {
          console.warn("Firebase timeout fallback triggered.");
          setState({ phase: "denied", tried: 99 });
          router.replace("/auth/login");
        }
      }, FIREBASE_TIMEOUT);
    };

    load();

    return () => {
      if (unsub) unsub();
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // While loading → never redirect or show blank screen
  if (state.phase === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm">
        Checking access…
      </div>
    );
  }

  if (state.phase === "denied") return null;

  return <>{children}</>;
}
