import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { uid } = await req.json();

    if (!uid) {
      return NextResponse.json(
        { error: "Missing uid" },
        { status: 400 }
      );
    }

    // 1. Update Firestore user doc
    await adminDb.collection("users").doc(uid).update({
      active: false,
      deactivatedAt: new Date(),
    });

    // 2. Set custom claim
    await adminAuth.setCustomUserClaims(uid, { deactivated: true });

    // 3. Revoke refresh tokens (forces logout everywhere)
    await adminAuth.revokeRefreshTokens(uid);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Deactivate error:", err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
