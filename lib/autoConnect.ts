// lib/autoConnect.ts
import { auth, db } from "@/lib/firebase";
import {
  arrayUnion,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

/**
 * Idempotent post-login wiring:
 * - Ensures users/{uid} has {role, storeId}
 * - Ensures membership doc exists:
 *     managers/supervisors -> stores/{storeId}/employees/{uid}
 *     trainees            -> stores/{storeId}/trainees/{uid}
 * - Backfills storeId if missing (via collectionGroup)
 * - Multi-manager safe: updates stores/{storeId}.managerUids (array)
 *   and sets legacy stores/{storeId}.managerUid only if blank
 */
export async function autoConnect(): Promise<{ role?: string; storeId?: string | null }> {
  const u = auth.currentUser;
  if (!u) return {};

  const uid = u.uid;
  const email = u.email ?? null;

  // 1) Load user profile
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const userData = userSnap.exists() ? (userSnap.data() as any) : null;

  const role: string | undefined = userData?.role;
  let storeId: string | null | undefined = userData?.storeId ?? null;

  if (!role) return {}; // nothing to wire

  // 2) If storeId missing, discover from membership (employees/trainees)
  if (!storeId) {
    // employees match by uid (primary)
    const qEmp = query(collectionGroup(db, "employees"), where("uid", "==", uid), limit(1));
    const empRes = await getDocs(qEmp);

    if (!empRes.empty) {
      const match = empRes.docs[0];
      storeId = match.ref.parent.parent?.id ?? null;
    } else {
      // trainees may have 'traineeId' (our roster shape) or legacy 'uid'
      let found: string | null = null;

      const tryQueries = [
        query(collectionGroup(db, "trainees"), where("traineeId", "==", uid), limit(1)),
        query(collectionGroup(db, "trainees"), where("uid", "==", uid), limit(1)),
        email
          ? query(collectionGroup(db, "trainees"), where("traineeEmail", "==", email), limit(1))
          : null,
      ].filter(Boolean) as any[];

      for (const q of tryQueries) {
        const tr = await getDocs(q);
        if (!tr.empty) {
          found = tr.docs[0].ref.parent.parent?.id ?? null;
          break;
        }
      }
      storeId = found;
    }

    if (storeId) {
      await setDoc(userRef, { storeId: String(storeId) }, { merge: true });
    }
  }

  // If still no storeId for non-admin roles, stop quietly
  if (role !== "admin" && !storeId) {
    return { role, storeId: null };
  }

  const sid = storeId ? String(storeId) : null;

  // 3) Ensure membership docs exist (idempotent)
  if (sid && (role === "manager" || role === "supervisor")) {
    // employees roster entry
    const empRef = doc(db, `stores/${sid}/employees/${uid}`);
    await setDoc(
      empRef,
      {
        uid,
        email: email ?? null,
        role,
        storeId: sid,
        active: true,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    // Multi-manager safety + legacy compatibility
    const storeRef = doc(db, "stores", sid);
    const storeSnap = await getDoc(storeRef);
    const hasPrimary = storeSnap.exists() && !!storeSnap.data()?.managerUid;

    const storeUpdate: Record<string, any> = {
      managerUids: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    };
    if (email) storeUpdate.managerEmails = arrayUnion(email);
    if (role === "manager" && !hasPrimary) storeUpdate.managerUid = uid;

    await setDoc(storeRef, storeUpdate, { merge: true });
  } else if (sid && role === "trainee") {
    // trainees roster entry (use traineeId + keep uid for legacy)
    const trnRef = doc(db, `stores/${sid}/trainees/${uid}`);
    await setDoc(
      trnRef,
      {
        traineeId: uid,
        traineeEmail: email ?? null,
        uid, // legacy compatibility
        email: email ?? null,
        storeId: sid,
        active: true,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  return { role, storeId: sid ?? null };
}
