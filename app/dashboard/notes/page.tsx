"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Note = {
  id: string;
  text?: string;
  fromRole?: string;
  toRole?: string;
  toUid?: string;
  targetUid?: string;
  createdAt?: Timestamp | number | string;
};

function tsToMillis(v: Note["createdAt"]): number {
  if (!v) return 0;
  // Firestore Timestamp
  // @ts-ignore
  if (typeof v === "object" && typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  }
  return 0;
}

export default function TraineeNotesPage() {
  const sp = useSearchParams();
  const storeId = sp.get("store") || "";
  const [uid, setUid] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // keep uid in sync with auth
  useEffect(() => {
    const stop = onIdTokenChanged(auth, (u) => setUid(u?.uid ?? null));
    return () => stop();
  }, []);

  // load notes addressed to this trainee at this store
  useEffect(() => {
    let alive = true;

    async function load() {
      if (!uid || !storeId) {
        setNotes([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const base = collection(db, "stores", storeId, "notes");

        // current pattern: supervisor → trainee (targetUid)
        const qTarget = query(
          base,
          where("toRole", "==", "trainee"),
          where("targetUid", "==", uid)
        );

        // legacy pattern: supervisor → trainee (toUid)
        const qLegacy = query(
          base,
          where("toRole", "==", "trainee"),
          where("toUid", "==", uid)
        );

        const [snapTarget, snapLegacy] = await Promise.all([
          getDocs(qTarget),
          getDocs(qLegacy),
        ]);

        const mergedMap = new Map<string, Note>();

        snapTarget.forEach((d) =>
          mergedMap.set(d.id, { id: d.id, ...(d.data() as any) })
        );
        snapLegacy.forEach((d) =>
          mergedMap.set(d.id, { id: d.id, ...(d.data() as any) })
        );

        const merged = Array.from(mergedMap.values()).sort(
          (a, b) => tsToMillis(b.createdAt) - tsToMillis(a.createdAt)
        );

        if (!alive) return;
        setNotes(merged);
      } catch (err) {
        console.error("[notes] error", err);
        if (!alive) return;
        setNotes([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [uid, storeId]);

  async function handleRemove(id: string) {
    if (!storeId || !id) return;
    try {
      await deleteDoc(doc(db, "stores", storeId, "notes", id));
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("Failed to remove note:", err);
      alert("Error removing note. Try again.");
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-primary">Notes</h1>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {!storeId ? (
        <p className="text-sm text-muted-foreground">
          No store provided. Open notes from your dashboard card.
        </p>
      ) : !uid ? (
        <p className="text-sm text-muted-foreground">Signing in…</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes from your supervisor yet.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <Card key={n.id} className="border bg-white shadow-sm">
              <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-3 px-4">
                <div>
                  <p className="text-sm font-medium text-primary">
                    {n.fromRole ? `${n.fromRole} → trainee` : "Message"}
                  </p>
                  <p className="text-sm whitespace-pre-wrap mt-1">
                    {n.text || ""}
                  </p>
                  {n.createdAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(tsToMillis(n.createdAt)).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-red-500 hover:text-red-700 mt-2 sm:mt-0 sm:ml-4"
                  onClick={() => handleRemove(n.id)}
                >
                  Remove
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}









