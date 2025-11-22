export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

type Body = { storeId: string; email: string };

export async function POST(req: Request) {
  try {
    const { storeId, email } = (await req.json()) as Body;
    if (!storeId || !email) {
      return NextResponse.json(
        { ok: false, error: "Missing storeId or email" },
        { status: 400 }
      );
    }

    // Create or fetch user
    let uid: string;
    try {
      uid = (await adminAuth.getUserByEmail(email)).uid;
    } catch {
      uid = (await adminAuth.createUser({ email })).uid;
    }

    // Claims + profile
    await adminAuth.setCustomUserClaims(uid, { role: "manager", storeId });
    await adminDb.collection("users").doc(uid).set(
      { email, role: "manager", storeId, updatedAt: Date.now() },
      { merge: true }
    );

    // Attach to store
    await adminDb.collection("stores").doc(storeId).set(
      { managerUid: uid, managerEmail: email, updatedAt: Date.now() },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}