// app/admin/stores/[id]/notes/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
  addDoc,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";

type Note = {
  id: string;
  text: string;
  fromRole: string;
  toRole: string;
  storeId?: string;
  targetUid?: string | null;
  createdBy?: string | null;
  createdAt?: { seconds: number; nanoseconds: number } | null;
};

type Manager = {
  uid: string;
  email?: string;
  name?: string;
};

export default function AdminStoreNotesPage() {
  // ⭐ FIXED: Correct way to read URL params in a client component
  const params = useSearchParams();
  const storeId = params.get("store") || null;

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const [managers, setManagers] = useState<Manager[]>([]);
  const [selectedManager, setSelectedManager] = useState("");

  const [textMgr, setTextMgr] = useState("");
  const [sending, setSending] = useState(false);

  // load manager → admin notes
  useEffect(() => {
    if (!storeId) return;
    setLoading(true);

    const qy = query(
      collection(db, "notes"),
      where("toRole", "==", "admin"),
      where("storeId", "==", String(storeId))
    );

    const unsub = onSnapshot(qy, (snap) => {
      const rows: Note[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));

      rows.sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );

      setNotes(rows);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  // managers for dropdown
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      try {
        const coll = collection(db, "stores", String(storeId), "employees");
        const qy = query(
          coll,
          where("active", "==", true),
          where("role", "==", "manager")
        );

        const snap = await getDocs(qy);

        const rows: Manager[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: data.uid || d.id,
            email: data.email,
            name: data.name,
          };
        });

        setManagers(rows);

        if (rows.length === 1) setSelectedManager(rows[0].uid);
      } catch (e) {
        console.error("load managers error:", e);
      }
    })();
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

  async function sendToManager() {
    const clean = textMgr.trim();
    if (!clean || !storeId) return;

    if (!selectedManager) {
      alert("Please select a manager.");
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db, "notes"), {
        text: clean,
        fromRole: "admin",
        toRole: "manager",
        storeId: String(storeId),
        targetUid: selectedManager,
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
      });

      setTextMgr("");
    } catch (e) {
      console.error(e);
      alert("Could not send note.");
    } finally {
      setSending(false);
    }
  }

  if (!storeId) {
    return (
      <main className="admin-notes mx-auto max-w-3xl p-4 lg:p-6">
        <h1 className="text-xl font-semibold mb-3">Notes</h1>
        <div className="rounded-md border bg-white p-3">
          <div className="text-sm text-gray-600">
            Missing <code>?store=STORE_ID</code> in the URL.
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-notes mx-auto max-w-3xl p-4 lg:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notes</h1>
        <Link
          href={`/admin/stores/${storeId}`}
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          ← Back to Store
        </Link>
      </div>

      {/* Inbox */}
      <section className="section">
        <div className="section-title">From Manager</div>

        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-gray-600">No notes yet.</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="item-row">
                <div className="min-w-0">
                  <div className="meta">
                    manager → admin
                    {n.createdAt?.seconds
                      ? " • " +
                        new Date(n.createdAt.seconds * 1000).toLocaleString()
                      : ""}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">
                    {n.text}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  className="link-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Composer */}
      <section className="section">
        <div className="section-title">Reply to Manager</div>

        <div className="mb-2">
          <select
            className="input"
            value={selectedManager}
            onChange={(e) => setSelectedManager(e.target.value)}
          >
            <option value="">Select manager…</option>
            {managers.map((m) => (
              <option key={m.uid} value={m.uid}>
                {m.email || m.name || m.uid}
              </option>
            ))}
          </select>
        </div>

        <div className="composer">
          <textarea
            rows={3}
            className="input"
            placeholder="Type your note…"
            value={textMgr}
            onChange={(e) => setTextMgr(e.target.value)}
          />
          <div className="actions">
            <button
              onClick={sendToManager}
              disabled={sending || !textMgr.trim()}
              className="btn-neutral disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
