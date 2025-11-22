"use client";

import { useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase";
import type { User } from "firebase/auth";

// 🟢 ADD THIS IMPORT
import { syncRosterOnce } from "@/lib/syncRoster";

function toInitials(nameOrEmail?: string | null) {
  if (!nameOrEmail) return "";
  const name = nameOrEmail.trim();
  const base = name.includes("@") ? name.split("@")[0] : name;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type UseAuthUser = {
  user: User | null;
  loading: boolean;
  error: string | null;
  displayName: string;
  initials: string;
  role: string | null;
  storeId: string | null;
};

export function useAuthUser(): UseAuthUser {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [loading, setLoading] = useState<boolean>(!auth.currentUser);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(
      async (u) => {
        setUser(u);
        setLoading(false);
        if (u) {
          // refresh token to get latest claims
          const token = await u.getIdTokenResult(true);
          setRole((token.claims?.role as string) ?? null);
          setStoreId((token.claims?.storeId as string) ?? null);

          // 🟢 CALL THE SYNC FUNCTION (one-time per login)
          await syncRosterOnce();
        } else {
          setRole(null);
          setStoreId(null);
        }
      },
      (err) => {
        console.error("Auth state error:", err);
        setError(err?.message ?? String(err));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.displayName || user.email || user.uid;
  }, [user]);

  const initials = useMemo(() => toInitials(displayName), [displayName]);

  return { user, loading, error, displayName, initials, role, storeId };
}
