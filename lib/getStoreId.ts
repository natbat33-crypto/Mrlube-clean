// lib/getStoreId.ts
import { getAuth } from "firebase/auth";
import {
  getFirestore, collectionGroup, query, where, getDocs,
  doc, getDoc, setDoc, serverTimestamp, collection
} from "firebase/firestore";

export type ResolvedStore = { storeId: string; role: string } | null;

/**
 * Resolves the signed-in user's {storeId, role} as robustly as possible.
 * Order:
 *  0) token claims (if present)
 *  1) cache: users/{uid}
 *  2) employees CG where uid field == user.uid
 *  3) direct probe: for each stores/{id}, check employees/{uid} doc exists
 *  4) legacy: traineeAssignments, stores where supervisorUid == uid
 *  5) optional server fallback (/api/resolve-store) if present
 */
export async function getResolvedStore(): Promise<ResolvedStore> {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return null;

  const db = getFirestore();
  const uid = user.uid;
  const userRef = doc(db, "users", uid);

  // ---- 0) token claims (if you ever add custom claims later)
  try {
    const token = await user.getIdTokenResult();
    const claimStoreId = (token.claims as any)?.storeId;
    const claimRole = (token.claims as any)?.role;
    if (claimStoreId) {
      return {
        storeId: String(claimStoreId),
        role: String(claimRole || "trainee"),
      };
    }
  } catch { /* ignore */ }

  // ---- 1) cached on users/{uid}
  try {
    const uSnap = await getDoc(userRef);
    if (uSnap.exists()) {
      const u: any = uSnap.data();
      const storeId = u?.storeId ?? u?.storeid; // support both fields
      const role = u?.role;
      if (storeId) {
        return {
          storeId: String(storeId),
          role: String(role || "trainee"),
        };
      }
    }
  } catch { /* ignore */ }

  // ---- 2) employees collection-group (field-based)
  try {
    const cg = collectionGroup(db, "employees");
    const res = await getDocs(query(cg, where("uid", "==", uid), where("active", "==", true)));
    if (!res.empty) {
      const d = res.docs[0];
      const role = ((d.data() as any)?.role ?? "trainee") as string;
      const storeId = d.ref.parent.parent!.id;
      await cacheStore(userRef, uid, user.email, storeId, role);
      return { storeId, role };
    }
  } catch { /* ignore */ }

  // ---- 3) direct probe: look for stores/*/employees/{uid} WITHOUT needing any fields
  try {
    const stores = await getDocs(collection(db, "stores"));
    for (const s of stores.docs) {
      const empRef = doc(db, "stores", s.id, "employees", uid);
      const empSnap = await getDoc(empRef);
      if (empSnap.exists()) {
        const role = ((empSnap.data() as any)?.role ?? "trainee") as string;
        const active = (empSnap.data() as any)?.active;
        if (active === false) continue; // honor explicit disables
        const storeId = s.id;
        await cacheStore(userRef, uid, user.email, storeId, role);
        return { storeId, role };
      }
    }
  } catch { /* ignore */ }

  // ---- 4) legacy fallbacks
  // 4a) traineeAssignments under each store
  try {
    const stores = await getDocs(collection(db, "stores"));
    for (const s of stores.docs) {
      const taRef = doc(db, "stores", s.id, "traineeAssignments", uid);
      const taSnap = await getDoc(taRef);
      if (taSnap.exists()) {
        const role = "trainee";
        const storeId = s.id;
        await cacheStore(userRef, uid, user.email, storeId, role);
        return { storeId, role };
      }
    }
  } catch { /* ignore */ }

  // 4b) store where supervisorUid == uid
  try {
    const q = query(collection(db, "stores"), where("supervisorUid", "==", uid));
    const r = await getDocs(q);
    if (!r.empty) {
      const storeId = r.docs[0].id;
      const role = "supervisor";
      await cacheStore(userRef, uid, user.email, storeId, role);
      return { storeId, role };
    }
  } catch { /* ignore */ }

  // ---- 5) optional server fallback (if you added /api/resolve-store; safe to ignore failures)
  try {
    const idToken = await user.getIdToken(/* forceRefresh */ true);
    const resp = await fetch("/api/resolve-store", {
      method: "GET",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data?.storeId) {
        const role = String(data.role || "trainee");
        const storeId = String(data.storeId);
        await cacheStore(userRef, uid, user.email, storeId, role);
        return { storeId, role };
      }
    }
  } catch { /* ignore */ }

  // Nothing found
  return null;
}

// Legacy shim for old imports
export async function getStoreId(): Promise<string | null> {
  const r = await getResolvedStore();
  return r?.storeId ?? null;
}

async function cacheStore(
  userRef: ReturnType<typeof doc>,
  uid: string,
  email: string | null | undefined,
  storeId: string,
  role: string
) {
  try {
    await setDoc(
      userRef,
      {
        uid,
        email: email ?? null,
        storeId,
        role,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch { /* ignore */ }
}




