"use client";

import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export async function clientAssignTrainee(
  storeId: string,
  traineeId: string,
  supervisorId: string
) {
  const ref = doc(db, "stores", storeId, "trainees", traineeId);
  await setDoc(
    ref,
    {
      supervisorId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}