// components/notes/SupervisorNotesPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

type Note = {
  id: string;
  text?: string;
  fromRole?: "admin" | "manager" | "supervisor" | "trainee";
  toRole?: "admin" | "manager" | "supervisor" | "trainee";
  storeId?: string;
  createdAt?: { seconds?: number; nanoseconds?: number } | null;
};

export default function SupervisorNotesPanel({ storeId }: { storeId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    setErr(null);

    // ✅ Only two filters (no composite index needed)
    const qy = query(
      collection(db, "notes"),
      where("storeId", "==", String(storeId)),
      where("toRole", "==", "supervisor")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Note[];

        // Show only manager → supervisor, newest first
        rows.sort(
          (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
        );

        setNotes(rows.filter((n) => n.fromRole === "manager"));
        setLoading(false);
      },
      (e) => {
        console.error("[SupervisorNotesPanel] listen error:", e);
        setErr(e?.message ?? "Failed to load notes.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [storeId]);

  async function remove(id: string) {
    if (!confirm("Remove this note?")) return;
    try {
      await deleteDoc(doc(db, "notes", id));
    } catch (e) {
      console.error(e);
      alert("Could not remove note.");
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (!notes.length) return <div className="text-sm text-muted-foreground">No notes from manager.</div>;

  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <li
          key={n.id}
          className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-white"
        >
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground mb-1">
              {n.createdAt?.seconds
                ? new Date(n.createdAt.seconds * 1000).toLocaleString()
                : "—"}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-5">
              {n.text ?? ""}
            </div>
          </div>
          <button
            onClick={() => remove(n.id)}
            className="text-xs text-red-500 hover:text-red-600 hover:underline"
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

