// components/RoleGate.tsx
"use client";

import { ReactNode, useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

type Props = {
  /** Preferred: list of allowed roles */
  allow?: string[];
  /** Back-compat: single expected role */
  expectedRole?: string;
  children: ReactNode;
};

/**
 * Role-based gate.
 * - Reads role from custom claims, then falls back to users/{uid}.role.
 * - If no `allow`/`expectedRole` provided, it doesn't gate (renders children).
 */
export default function RoleGate({ allow, expectedRole, children }: Props) {
  const [ok, setOk] = useState<boolean>(true); // default permissive if no roles given
  const [hasRulesChecked, setHasRulesChecked] = useState<boolean>(false);

  useEffect(() => {
    const wanted = allow ?? (expectedRole ? [expectedRole] : undefined);

    // If no roles specified, don't gate
    if (!wanted || wanted.length === 0) {
      setOk(true);
      setHasRulesChecked(true);
      return;
    }

    setHasRulesChecked(false);
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setOk(false);
        setHasRulesChecked(true);
        return;
      }
      try {
        // 1) try token claims
        const t = await u.getIdTokenResult(true);
        let role = (t.claims?.role as string | undefined) ?? null;
        // 2) fallback to users/{uid}.role
        if (!role) {
          const snap = await getDoc(doc(db, "users", u.uid));
          if (snap.exists()) {
            const v = snap.data() as any;
            if (typeof v?.role === "string") role = v.role;
          }
        }
        setOk(!!role && wanted.includes(role));
      } catch {
        setOk(false);
      } finally {
        setHasRulesChecked(true);
      }
    });

    return () => unsub();
  }, [allow, expectedRole]);

  if (!hasRulesChecked) return null; // avoid flicker
  if (!ok) return null;
  return <>{children}</>;
}
