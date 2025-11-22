// app/admin/stores/notes/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

export default function AdminStoreNotesPage({
  searchParams,
}: {
  searchParams: { store?: string };
}) {
  const storeId = searchParams.store;
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  // managers for this store (multi-manager safe)
  const [managers, setManagers] = useState<Manager[]>([]);
  const [selectedManager, setSelectedManager] = useState("");

  // composer
  const [textMgr, setTextMgr] = useState("");
  const [sending, setSending] = useState(false);

  // load manager → admin notes for this store
  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    const qy = query(
      collection(db, "notes"),
      where("toRole", "==", "admin"),
      where("storeId", "==", String(storeId))
    );

    const unsub = onSnapshot(qy, (snap) => {
      const rows: Note[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      rows.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setNotes(rows);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  // load managers for dropdown (active only)
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
        setManagers([]);
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

  // admin → manager (for this store, with optional target manager uid)
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
        <div className="rounded-md border border-[var(--line)] bg-white p-3">
          <div className="text-sm text-muted-foreground">
            Missing <code>?store=STORE_ID</code> in the URL.
          </div>
        </div>
        <style jsx global>{`
          .admin-notes {
            --line: #eaecef;
            --muted: #f8f9fb;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="admin-notes mx-auto max-w-3xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notes</h1>
        <Link
          href={`/admin/stores/${storeId}`}
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Store
        </Link>
      </div>

      {/* Inbox (manager → admin) */}
      <section className="section">
        <div className="section-title">From Manager</div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No notes yet.</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="item-row">
                <div className="min-w-0">
                  <div className="meta">
                    manager → admin
                    {n.createdAt?.seconds
                      ? " • " + new Date(n.createdAt.seconds * 1000).toLocaleString()
                      : ""}
                  </div>
                  <div className="text-sm leading-5 whitespace-pre-wrap">
                    {n.text}
                  </div>
                </div>
                <button onClick={() => handleDelete(n.id)} className="link-danger">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reply (admin → manager) */}
      <section className="section">
        <div className="section-title">Reply to Manager</div>

        {/* manager dropdown (multi-manager support) */}
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

      {/* Styles to match manager/supervisor pages */}
      <style jsx global>{`
        .admin-notes {
          --line: #eaecef;
          --muted: #f8f9fb;
        }
        .admin-notes .section {
          padding: 12px 0 18px 0;
          border-top: 1px solid var(--line);
        }
        .admin-notes .section:first-of-type {
          border-top: none;
          padding-top: 0;
        }
        .admin-notes .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 8px;
        }
        .admin-notes .composer {
          margin-top: 10px;
        }
        .admin-notes .input {
          width: 100%;
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          resize: vertical;
        }
        .admin-notes .actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
        }
        .admin-notes .btn-neutral {
          border: 1px solid var(--line);
          background: #fff;
          color: #111;
          padding: 6px 12px;
          font-size: 13px;
          border-radius: 8px;
        }
        .admin-notes .btn-neutral:hover {
          background: var(--muted);
        }
        .admin-notes .item-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 10px;
        }
        .admin-notes .meta {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .admin-notes .link-danger {
          color: #ef4444;
          font-size: 12px;
          line-height: 1;
          padding-top: 2px;
        }
        .admin-notes .link-danger:hover {
          color: #dc2626;
          text-decoration: underline;
        }
      `}</style>
    </main>
  );
}

