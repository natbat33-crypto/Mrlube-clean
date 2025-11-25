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
  createdAt?: { seconds?: number; nanoseconds?: number } | null;
};

type Manager = {
  uid: string;
  email?: string;
  name?: string;
};

export default function AdminStoreNotesPage() {
  const params = useSearchParams();
  const storeId = params.get("store") || null;

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);

  const [managers, setManagers] = useState<Manager[]>([]);
  const [selectedManager, setSelectedManager] = useState("");

  const [textMgr, setTextMgr] = useState("");
  const [sending, setSending] = useState(false);

  // -------------------------------
  // Load notes sent to admin
  // -------------------------------
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

  // -------------------------------
  // Load active managers
  // -------------------------------
  useEffect(() => {
    if (!storeId) return;

    (async () => {
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

      if (rows.length === 1) {
        setSelectedManager(rows[0].uid);
      }
    })();
  }, [storeId]);

  // -------------------------------
  // Delete note
  // -------------------------------
  async function removeNote(id: string) {
    if (!confirm("Remove this note?")) return;

    try {
      await deleteDoc(doc(db, "notes", id));
    } catch {
      alert("Could not remove note.");
    }
  }

  // -------------------------------
  // Send note to manager
  // -------------------------------
  async function sendToManager() {
    const clean = textMgr.trim();
    if (!clean || !storeId) return;

    if (!selectedManager) {
      alert("Select a manager first.");
      return;
    }

    setSending(true);

    try {
      await addDoc(collection(db, "notes"), {
        text: clean,
        fromRole: "admin",
        toRole: "manager",
        storeId,
        targetUid: selectedManager,
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
      });

      setTextMgr("");
    } catch {
      alert("Could not send note.");
    } finally {
      setSending(false);
    }
  }

  // -------------------------------
  // Render
  // -------------------------------
  if (!storeId)
    return (
      <main className="mx-auto max-w-3xl p-6">Missing ?store=STORE_ID</main>
    );

  return (
    <main className="admin-notes mx-auto max-w-3xl p-4 lg:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notes</h1>

        <Link
          href={`/admin/stores/${storeId}`}
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Store
        </Link>
      </div>

      {/* ============================== */}
      {/*     NOTES FROM MANAGER         */}
      {/* ============================== */}
      <section className="section">
        <div className="section-title">From Manager</div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No messages yet.</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="item-row">
                <div className="min-w-0">
                  <div className="meta">
                    manager → admin{" "}
                    {n.createdAt?.seconds
                      ? "• " +
                        new Date(n.createdAt.seconds * 1000).toLocaleString()
                      : ""}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                </div>

                <button onClick={() => removeNote(n.id)} className="link-danger">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ============================== */}
      {/*       REPLY TO MANAGER         */}
      {/* ============================== */}
      <section className="section">
        <div className="section-title">Send a note to Manager</div>

        {/* Manager dropdown */}
        <select
          value={selectedManager}
          onChange={(e) => setSelectedManager(e.target.value)}
          className="input mb-2"
        >
          <option value="">Select manager…</option>
          {managers.map((m) => (
            <option key={m.uid} value={m.uid}>
              {m.email || m.name || m.uid}
            </option>
          ))}
        </select>

        {/* Message box */}
        <textarea
          rows={3}
          placeholder="Type your note…"
          className="input"
          value={textMgr}
          onChange={(e) => setTextMgr(e.target.value)}
        />

        <div className="actions">
          <button
            onClick={sendToManager}
            disabled={sending || !textMgr.trim()}
            className="btn-neutral"
          >
            Send
          </button>
        </div>
      </section>

      {/* MATCHING STYLES (copied from manager version) */}
      <style jsx global>{`
        .admin-notes {
          --line: #eaecef;
          --muted: #f8f9fb;
        }
        .section {
          padding: 12px 0 18px;
          border-top: 1px solid var(--line);
        }
        .section:first-of-type {
          border-top: none;
        }
        .section-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .item-row {
          padding: 10px 12px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: white;
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .meta {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .input {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          background: white;
        }
        .actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
        }
        .btn-neutral {
          border: 1px solid var(--line);
          padding: 6px 12px;
          border-radius: 8px;
          background: white;
        }
        .link-danger {
          color: #ef4444;
          font-size: 12px;
        }
      `}</style>
    </main>
  );
}

