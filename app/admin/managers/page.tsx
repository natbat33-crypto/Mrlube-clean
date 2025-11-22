// app/manager/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  onSnapshot,
  where,
  query,
} from "firebase/firestore";
import { autoConnect } from "@/lib/autoConnect";
import NoteComposer from "@/components/notes/NoteComposer";

type Store = {
  number: number;
  name: string;
  address: string;
  managerUid?: string | null;
};

type Note = {
  id: string;
  text: string;
  fromRole: string;
  toRole: string;
  storeId?: string;
  createdAt?: { seconds: number; nanoseconds: number } | null;
};

export default function ManagerDashboard() {
  const [uid, setUid] = useState<string | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  // 🔑 Single source of truth: users/{uid}.storeId
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      setStore(null);
      setStoreId(null);

      if (!u) {
        setUid(null);
        setLoading(false);
        return;
      }

      setUid(u.uid);

      // Ensure membership wiring exists (idempotent)
      await autoConnect();

      // Read definitive mapping from user profile
      const userSnap = await getDoc(doc(db, "users", u.uid));
      const user = userSnap.exists() ? (userSnap.data() as any) : null;
      const sid: string | null = user?.storeId ? String(user.storeId) : null;

      if (sid) {
        setStoreId(sid);
        const snap = await getDoc(doc(db, "stores", sid));
        setStore(snap.exists() ? (snap.data() as Store) : null);
      } else {
        setStoreId(null);
        setStore(null);
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  // Admin -> Manager notes for this store (live)
  useEffect(() => {
    if (!storeId) return;
    setNotesLoading(true);
    const qy = query(
      collection(db, "notes"),
      where("toRole", "==", "manager"),
      where("storeId", "==", storeId)
    );
    const unsub = onSnapshot(qy, (snap) => {
      const rows: Note[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      rows.sort((a, b) => {
        const at = a.createdAt?.seconds ?? 0;
        const bt = b.createdAt?.seconds ?? 0;
        return bt - at;
      });
      setNotes(rows);
      setNotesLoading(false);
    });
    return () => unsub();
  }, [storeId]);

  if (!uid) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Manager Dashboard</h1>
        <p className="text-gray-600 mt-1">Please sign in.</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Manager Dashboard</h1>
        <p className="text-gray-600 mt-1">Loading…</p>
      </main>
    );
  }

  if (!storeId) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">Manager Dashboard</h1>
        <p className="text-gray-600 mt-1">No store assigned yet.</p>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Manager Dashboard</h1>
      <p className="text-gray-600">What you manage.</p>

      {store && (
        <section className="rounded-xl border p-4 bg-white/60">
          <h2 className="font-semibold">Store #{store.number}</h2>
          <div className="text-sm text-gray-700">{store.name}</div>
          <div className="text-sm text-gray-700">{store.address}</div>

          <div className="mt-3">
            <Link
              href={`/manager/stores/${storeId}`}
              className="inline-flex items-center text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
            >
              View store →
            </Link>
          </div>
        </section>
      )}

      {/* Admin -> Manager notes feed (for this store) */}
      <section className="rounded-xl border p-4 bg-white/60">
        <h2 className="font-semibold">Notes from Admin</h2>
        <p className="text-sm text-gray-600 mb-3">
          Messages sent to you for Store #{store?.number ?? "-"}.
        </p>

        {notesLoading && (
          <div className="text-sm text-gray-600">Loading notes…</div>
        )}

        {!notesLoading && notes.length === 0 && (
          <div className="text-sm text-gray-600">No notes yet.</div>
        )}

        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border p-3 bg-white text-sm">
              <div className="text-xs text-gray-500 mb-1">
                {n.fromRole} → {n.toRole}
                {n.createdAt?.seconds ? (
                  <> • {new Date(n.createdAt.seconds * 1000).toLocaleString()}</>
                ) : null}
              </div>
              <div className="whitespace-pre-wrap">{n.text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Manager -> Admin composer */}
      <section className="rounded-xl border p-4 bg-white/60">
        <h2 className="font-semibold">Reply to Admin</h2>
        <p className="text-sm text-gray-600 mb-3">
          Send a message back to Admin (choose your store).
        </p>
        <NoteComposer fromRole="manager" toRole="admin" />
      </section>
    </main>
  );
}

