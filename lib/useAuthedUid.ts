// lib/useAuthedUid.ts
"use client";
import { useAuthUser } from "@/lib/useAuthUser";

export function useAuthedUid() {
  const { user, loading } = useAuthUser();
  return { uid: user?.uid ?? null, loadingAuth: loading };
}
