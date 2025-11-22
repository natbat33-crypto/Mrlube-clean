// lib/assignments.ts
// Writes the assignment to /stores/{storeId}/trainees/{traineeUid}
// to match the dashboards' reader (queries by supervisorId).
"use server";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";

/** Assign a trainee to a supervisor (manager-only per rules). */
export async function assignTrainee(
  storeId: string | number,
  traineeUid: string,
  supervisorUid: string
) {
  const store = String(storeId); // MUST be a string ("24"), not number 24
  const ref = doc(db, "stores", store, "trainees", traineeUid);

  if (!auth.currentUser) throw new Error("Not signed in");

  // Payload matches the Firestore rules exactly
  await setDoc(
    ref,
    {
      storeId: store,                  // string
      traineeId: traineeUid,           // equals doc id
      supervisorId: supervisorUid,     // dashboards query by this
      active: true,
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Remove an assignment (optional helper). */
export async function unassignTrainee(
  storeId: string | number,
  traineeUid: string
) {
  const store = String(storeId);
  const ref = doc(db, "stores", store, "trainees", traineeUid);
  await deleteDoc(ref);
}

// Support both named and default imports
export default { assignTrainee, unassignTrainee };

