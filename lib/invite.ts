import { db } from "@/lib/firebase";
import {
  doc, getDoc, runTransaction, serverTimestamp, increment
} from "firebase/firestore";

export async function consumeInvite(code: string, uid: string, email?: string) {
  const inviteRef = doc(db, "invites", code);
  const userRef   = doc(db, "users", uid);

  return await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(inviteRef);
    if (!invSnap.exists()) throw new Error("Invite not found");
    const inv = invSnap.data() as any;

    if (inv.disabled) throw new Error("Invite disabled");
    if (typeof inv.maxUses === "number") {
      if ((inv.uses ?? 0) >= inv.maxUses) throw new Error("Invite exhausted");
    } else if (inv.used) {
      throw new Error("Invite already used");
    }

    const role = inv.role as "admin"|"manager"|"supervisor"|"trainee"|"employee";
    const storeId: string | null = inv.storeId ?? null;

    // 1) user profile
    tx.set(userRef, {
      email: email ?? null,
      role,
      storeId: role === "admin" ? null : storeId,
      createdAt: serverTimestamp(),
      startDate: serverTimestamp(),
    }, { merge: true });

    // 2) gate/roster
    if (role === "manager" || role === "supervisor") {
      if (!storeId) throw new Error("Missing storeId");
      const gateRef = doc(db, `stores/${storeId}/employees/${uid}`);
      tx.set(gateRef, {
        uid, email: email ?? null, role, storeId, active: true, createdAt: serverTimestamp(),
      }, { merge: true });
    } else if (role === "trainee") {
      if (!storeId) throw new Error("Missing storeId");
      const rosterRef = doc(db, `stores/${storeId}/trainees/${uid}`);
      tx.set(rosterRef, {
        uid, email: email ?? null, storeId, active: true, createdAt: serverTimestamp(),
      }, { merge: true });
    }

    // 3) mark usage
    if (typeof inv.maxUses === "number") {
      tx.update(inviteRef, { uses: increment(1), lastUsedAt: serverTimestamp(), lastUsedBy: uid });
    } else {
      tx.update(inviteRef, { used: true, usedAt: serverTimestamp(), usedBy: uid });
    }

    return { role, storeId };
  });
}
