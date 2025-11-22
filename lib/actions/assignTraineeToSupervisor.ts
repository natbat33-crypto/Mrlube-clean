import { db } from "@/lib/firebase";
import {
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

export async function assignTraineeToSupervisor(
  storeId: string,
  traineeUid: string,
  supervisorUid: string,
  managerUid: string
) {
  const batch = writeBatch(db);

  // users/{traineeUid}
  batch.set(
    doc(db, "users", traineeUid),
    {
      storeId,
      supervisorUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // users/{supervisorUid}
  batch.set(
    doc(db, "users", supervisorUid),
    {
      storeId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // stores/{storeId}/trainees/{traineeUid}
  batch.set(
    doc(db, "stores", storeId, "trainees", traineeUid),
    {
      traineeId: traineeUid,
      supervisorId: supervisorUid,
      storeId,
      active: true,
      createdBy: managerUid,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  // stores/{storeId}/employees/{traineeUid}
  batch.set(
    doc(db, "stores", storeId, "employees", traineeUid),
    {
      userId: traineeUid,
      role: "trainee",
      storeId,
      active: true,
    },
    { merge: true }
  );

  // stores/{storeId}/employees/{supervisorUid}
  batch.set(
    doc(db, "stores", storeId, "employees", supervisorUid),
    {
      userId: supervisorUid,
      role: "supervisor",
      storeId,
      active: true,
    },
    { merge: true }
  );

  await batch.commit();
}
