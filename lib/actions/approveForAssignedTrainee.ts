// lib/actions/approveForAssignedTrainee.ts
"use server";
import "server-only";

import { getFirestore, FieldValue } from "firebase-admin/firestore";
// ⬇️ point at your actual initializer file
import "@/lib/firebase-admin"; // ensures admin is initialized

const db = getFirestore();

/**
 * Approve OR unapprove a trainee's progress doc for a given store + task path.
 * @param storeId      e.g. "24"
 * @param progressPath e.g. "modules/week1/tasks/check-oil"
 * @param next         true = approve, false = unapprove (default approve)
 */
export async function approveForAssignedTrainee(
  storeId: string,
  progressPath: string,
  next: boolean = true
): Promise<void> {
  // Find the progress doc for this store + path (must be done=true)
  const snap = await db
    .collectionGroup("progress")
    .where("storeId", "==", storeId)
    .where("path", "==", progressPath)
    .where("done", "==", true)
    .limit(1)
    .get();

  if (snap.empty) throw new Error("No matching progress doc found.");

  const ref = snap.docs[0].ref;
  await ref.update({
    approved: next,
    approvedAt: next ? FieldValue.serverTimestamp() : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}


