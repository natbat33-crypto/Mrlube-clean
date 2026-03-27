import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { uid, email } = await req.json();

    if (!uid) {
      return NextResponse.json(
        { error: "Missing uid" },
        { status: 400 }
      );
    }

    // 1. Delete from ALL store subcollections
    const storesSnap = await adminDb.collection("stores").get();

    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;

      const empRef = adminDb
        .collection("stores")
        .doc(storeId)
        .collection("employees")
        .doc(uid);

      const traineeRef = adminDb
        .collection("stores")
        .doc(storeId)
        .collection("trainees")
        .doc(uid);

      await empRef.delete().catch(() => {});
      await traineeRef.delete().catch(() => {});
    }

    // 2. Delete user progress + sections
    const progressSnap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("progress")
      .get();

    for (const doc of progressSnap.docs) {
      await doc.ref.delete();
    }

    const sectionsSnap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("sections")
      .get();

    for (const doc of sectionsSnap.docs) {
      await doc.ref.delete();
    }

    // 3. Delete main user doc
    await adminDb.collection("users").doc(uid).delete().catch(() => {});

    // 4. Delete Auth user
    await adminAuth.deleteUser(uid).catch(() => {});

    // 5. OPTIONAL: Send email (simple version via webhook or console log)
    console.log(`User deleted: ${uid} ${email || ""}`);

    // If you want real email later → we plug SendGrid here

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Delete error:", err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}