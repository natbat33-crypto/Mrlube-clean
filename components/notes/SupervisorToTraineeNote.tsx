"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";

type Props = {
  storeId: string | number;   // caller can pass number or string
  traineeUid: string;         // AbfXzd1N9AVGYZoCLEDe0PKaPBu1
};

export default function SupervisorToTraineeNote({ storeId, traineeUid }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const u = auth.currentUser;
    if (!u) {
      alert("You must be signed in.");
      return;
    }
    if (!traineeUid) {
      alert("No trainee selected.");
      return;
    }
    if (!text.trim()) return;

    setSending(true);
    try {
      // ✅ always write the shape your rules expect
      const storeIdStr = String(storeId); // force string for rules
      await addDoc(collection(db, "stores", storeIdStr, "notes"), {
        storeId: storeIdStr,           // string per rules
        targetUid: traineeUid,         // trainee uid
        toRole: "trainee",
        fromRole: "supervisor",
        createdBy: u.uid,              // not required by rules, but useful
        text: text.trim(),
        createdAt: serverTimestamp(),
      });

      setText("");
    } catch (err: any) {
      console.error("send note error:", err);
      alert(err?.message ?? "Could not send note.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your note…"
        className="w-full rounded border p-3 text-sm"
        rows={3}
      />
      <button
        onClick={send}
        disabled={sending}
        className="rounded bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send note"}
      </button>

      {/* tiny debug footer to confirm we’re sending to the right IDs */}
      <div className="text-[11px] text-muted-foreground">
        to: <code>{traineeUid}</code> • store: <code>{String(storeId)}</code>
      </div>
    </div>
  );
}



