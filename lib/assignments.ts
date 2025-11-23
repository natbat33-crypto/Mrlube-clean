// lib/assignments.ts
// Writes the assignment to /stores/{storeId}/trainees/{traineeUid}
// to match the dashboards' reader (queries by supervisorId).

// NO "use server" — this must stay a client utility
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



