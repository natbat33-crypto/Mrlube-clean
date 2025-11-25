export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../lib/firebase-admin";

type Body = { 
  email: string; 
  storeId?: string; 
  role?: "employee" | "manager"; 
};

export async function POST(req: Request) {
  try {
    const { email, storeId, role } = (await req.json()) as Body;
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Missing email" },
        { status: 400 }
      );
    }

    // default to employee if not specified
    const assignedRole = role ?? "employee";

    // --- Create or fetch user ---
    let uid: string;
    try {
      uid = (await adminAuth.getUserByEmail(email)).uid;
    } catch {
      uid = (await adminAuth.createUser({ email })).uid;
    }

    // --- Save user document ---
    await adminDb.collection("users").doc(uid).set(
      {
        email,
        role: assignedRole,
        storeId: storeId ?? null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // --- Auto-assign manager to store ---
    if (assignedRole === "manager" && storeId) {
      await adminDb.doc(`stores/${storeId}`).set(
        { managerId: uid },
        { merge: true }
      );
    }

    return NextResponse.json({ ok: true, uid });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
