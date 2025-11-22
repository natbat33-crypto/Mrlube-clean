import { db } from "@/lib/firebase";
import { doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export async function saveProgress({
  uid,
  week,            // e.g. "week1" | "day1" | "week2"
  path,            // e.g. "modules/week1/tasks/<taskId>"
  data = {},       // any extra fields (completed, notes, etc.)
}: {
  uid: string;
  week: string;
  path: string;
  data?: Record<string, any>;
}) {
  const key = path.replace(/\//g, "__");
  await setDoc(
    doc(db, "users", uid, "progress", key),
    {
      path,
      week,
      updatedAt: serverTimestamp(),
      ...data,
    },
    { merge: true }
  );
}

// ✅ Added for Vercel build (used in approveForAssignedTrainee.ts)
export async function approveProgress({
  traineeId,
  progressDocId,
}: {
  traineeId: string;
  progressDocId: string;
}) {
  const ref = doc(db, "users", traineeId, "progress", progressDocId);
  await updateDoc(ref, {
    approved: true,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

