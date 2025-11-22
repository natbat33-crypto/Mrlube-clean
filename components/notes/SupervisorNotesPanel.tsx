// components/notes/SupervisorNotesPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import NoteComposer from "@/components/notes/NoteComposer";

type Note = {
  id: string;
  text: string;
  fromRole: string;
  toRole: string;
  storeId?: string | number;
  createdAt?: { seconds?: number; nanoseconds?: number } | null;
};

export default function SupervisorNotesPanel({ storeId }: { storeId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);

    // Some docs may have storeId saved as a string, others as a number.
    // Listen to BOTH and merge results.
    const asNum = Number(storeId);
    const listenToString = query(
      collection(db, "notes"),
      where("toRole", "==", "supervisor"),
      where("fromRole", "==", "manager"),
      where("storeId", "==", storeId)
    );
    const listeners: Array<() => void> = [];

    function applySnapshots(...snaps: QuerySnapshot<DocumentData>[]) {
      const map = new Map<string, Note>();
      for (const snap of snaps) {
        snap?.docs.forEach((d) =>
          map.set(d.id, { id: d.id, ...(d.data() as any) })
        );
      }
      const rows = Array.from(map.values()).sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );
      setNotes(rows);
      setLoading(false);
    }

    let lastStrSnap: QuerySnapshot<DocumentData> | null = null;
    let lastNumSnap: QuerySnapshot<DocumentData> | null = null;

    const unsubStr = onSnapshot(
      listenToString,
      (snap) => {
        lastStrSnap = snap;
        applySnapshots(lastStrSnap!, lastNumSnap!);
      },
      (err) => {
        console.error("Notes(str) listener error:", err);
        // still try to render any other listener
        setLoading(false);
      }
    );
    listeners.push(unsubStr);

    if (!Number.isNaN(asNum)) {
      const listenToNumber = query(
        collection(db, "notes"),
        where("toRole", "==", "supervisor"),
        where("fromRole", "==", "manager"),
        where("storeId", "==", asNum)
      );
      const unsubNum = onSnapshot(
        listenToNumber,
        (snap) => {
          lastNumSnap = snap;
          applySnapshots(lastStrSnap!, lastNumSnap!);
        },
        (err) => {
          console.error("Notes(num) listener error:", err);
          setLoading(false);
        }
      );
      listeners.push(unsubNum);
    }

    return () => listeners.forEach((u) => u());
  }, [storeId]);

  async function handleDelete(noteId: string) {
    if (!confirm("Remove this note?")) return;
    try {
      await deleteDoc(doc(db, "notes", noteId));
    } catch (e) {
      console.error("Failed to remove note:", e);
      alert("Could not remove note.");
    }
  }

  return (
    <section className="rounded-xl border bg-white/60 p-4 space-y-4">
      <h2 className="font-semibold">Notes from Manager</h2>

      {loading ? (
        <div className="text-sm text-gray-600">Loading…</div>
      ) : notes.length === 0 ? (
        <div className="text-sm text-gray-600">No notes yet.</div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-lg border p-3 bg-white text-sm relative"
            >
              <button
                onClick={() => handleDelete(n.id)}
                className="absolute right-2 top-2 text-xs border rounded px-2 py-0.5 hover:bg-gray-50"
                aria-label="Remove note"
              >
                Remove
              </button>

              <div className="text-xs text-gray-500 mb-1 pr-16">
                {n.fromRole} → {n.toRole}
                {n.createdAt?.seconds ? (
                  <> • {new Date(n.createdAt.seconds * 1000).toLocaleString()}</>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap">{n.text}</div>
            </div>
          ))}
        </div>
      )}

      {/* Reply to Manager (store fixed; no dropdown) */}
      <div className="pt-3 border-t">
        <h3 className="font-semibold text-sm mb-2">Reply to Manager</h3>
        <NoteComposer fromRole="supervisor" toRole="manager" fixedStoreId={storeId} />
      </div>
    </section>
  );
}


