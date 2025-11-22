export const runtime = "nodejs";
export const dynamic = "force-dynamic";


import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../lib/firebase-admin";

type Body = { email: string; storeId?: string };

export async function POST(req: Request) {
  try {
    const { email, storeId } = (await req.json()) as Body;
    if (!email) {
      return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
    }

    let uid: string;
    try {
      uid = (await adminAuth.getUserByEmail(email)).uid;
    } catch {
      uid = (await adminAuth.createUser({ email })).uid;
    }

    await adminDb.collection("users").doc(uid).set(
      { email, role: "employee", storeId: storeId ?? null, updatedAt: Date.now() },
      { merge: true }
    );

    return NextResponse.json({ ok: true, uid });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}