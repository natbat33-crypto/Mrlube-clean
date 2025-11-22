"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  DocumentData,
  QuerySnapshot,
} from "firebase/firestore";

type Note = {
  id: string;
  text: string;
  fromRole: string;   // "supervisor"
  toRole: string;     // "trainee"
  storeId?: string | number;
  targetUid?: string; // trainee uid
  createdAt?: { seconds?: number; nanoseconds?: number } | null;
};

export default function NotesFromSupervisor({
  storeId,
  traineeUid,
}: {
  storeId: string;
  traineeUid: string;
}) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId || !traineeUid) return;
    setLoading(true);

    // listen under stores/{storeId}/notes where supervisor -> trainee and targetUid matches
    const qStr = query(
      collection(db, "stores", String(storeId), "notes"),
      where("fromRole", "==", "supervisor"),
      where("toRole", "==", "trainee"),
      where("targetUid", "==", traineeUid)
    );

    const unsub = onSnapshot(
      qStr,
      (snap: QuerySnapshot<DocumentData>) => {
        const rows: Note[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotes(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [storeId, traineeUid]);

  return (
    <section className="space-y-3">
      <h3 className="font-semibold text-sm">Notes from Supervisor</h3>

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-gray-600">No notes yet.</div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border border-yellow-200 bg-white p-3 text-sm"
            >
              <div className="text-xs text-gray-500 mb-1">
                {n.createdAt?.seconds
                  ? new Date(n.createdAt.seconds * 1000).toLocaleString()
                  : "—"}
              </div>
              <div className="whitespace-pre-wrap">{n.text}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
