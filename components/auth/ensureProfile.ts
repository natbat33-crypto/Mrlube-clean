"use client";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export async function ensureUserProfile(defaultRole: "employee" | "manager" | "supervisor" | "admin" = "employee") {
  const u = auth.currentUser;
  if (!u) return null;
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // new account → create minimal profile
    await setDoc(ref, {
      uid: u.uid,
      email: u.email ?? "",
      name: u.displayName ?? "",
      role: defaultRole,      // employees by default; managers/admins can upgrade via UI
      storeId: null,          // manager assigns later
      createdAt: serverTimestamp(),
    });
  }
  return (await getDoc(ref)).data();
}
