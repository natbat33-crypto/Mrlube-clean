// lib/assignments.ts
// Writes the assignment to /stores/{storeId}/trainees/{traineeUid}
// This file MUST be client-side because we use auth + Firestore client SDK.

// ❌ DO NOT USE: "use server"

// Firestore client SDK
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

/** Assign a trainee to a supervisor (manager-only per rules). */
export async function assignTrainee(
  storeId: string | number,
  traineeUid: string,
  supervisorUid: string
) {
  const store = String(storeId);

  if (!auth.currentUser) {
    throw new Error("Not signed in");
  }

  const ref = doc(db, "stores", store, "trainees", traineeUid);

  await setDoc(
    ref,
    {
      storeId: store,
      traineeId: traineeUid,
      supervisorId: supervisorUid,
      active: true,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Remove an assignment. */
export async function unassignTrainee(
  storeId: string | number,
  traineeUid: string
) {
  const store = String(storeId);
  const ref = doc(db, "stores", store, "trainees", traineeUid);
  await deleteDoc(ref);
}

// ✔ Named exports ONLY — no default export in client utility files
export { assignTrainee, unassignTrainee };
