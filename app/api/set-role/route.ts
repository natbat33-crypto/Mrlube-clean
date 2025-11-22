// app/api/set-role/route.ts
export const runtime = "nodejs";            // ⬅️ needed because we use fs in firebase-admin
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { email, uid, role, storeId } = await req.json();
    if (!role || (!email && !uid)) {
      return NextResponse.json({ error: "Provide role and email or uid" }, { status: 400 });
    }

    const user = uid ? await adminAuth.getUser(uid) : await adminAuth.getUserByEmail(email);

    await adminAuth.setCustomUserClaims(user.uid, {
      role,
      ...(storeId ? { storeId } : {}),
    });

    // optional: mirror to Firestore
    await adminDb.collection("users").doc(user.uid).set(
      { role, store_id: storeId ?? null },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid: user.uid, email: user.email, role, storeId: storeId ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}