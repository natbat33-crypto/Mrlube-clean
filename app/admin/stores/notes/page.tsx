"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

type Note = {
  id: string;
  text: string;
  fromRole: string;
  toRole: string;
  storeId?: string;
  targetUid?: string | null;
  createdBy?: string | null;
  createdAt?: { seconds?: number } | null;
};

type Person = {
  uid: string;
  name?: string;
  role?: string;
  email?: string;
};

export default function AdminStoreNotesPage() {
  const params = useSearchParams();
  const storeId = params.get("store") || null;

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);

  const [people, setPeople] = useState<Person[]>([]);
  const [allUsers, setAllUsers] = useState<Person[]>([]); // ⭐ NEW

  const [selectedRecipient, setSelectedRecipient] = useState("");

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  /* ---------------------------------------------------------
     PRETTY ROLE DISPLAY
  --------------------------------------------------------- */
  function prettyRole(r?: string) {
    if (!r) return "Unknown";
    if (r === "supervisor") return "Trainer";
    if (r === "manager") return "Manager";
    if (r === "trainee") return "Trainee";
    if (r === "admin") return "Admin";
    return r;
  }

  /* ---------------------------------------------------------
     RESOLVE NAME OR EMAIL FOR UID  (Admin, Manager, Trainee, etc.)
  --------------------------------------------------------- */
  function resolveName(uid?: string | null) {
    if (!uid) return null;

    // First check store employees
    let p = people.find((x) => x.uid === uid);

    // Then check global users (admins + any user in /users)
    if (!p) p = allUsers.find((x) => x.uid === uid);

    if (!p) return null;

    return p.name?.trim() ? p.name : p.email || null;
  }

  /* ---------------------------------------------------------
     LOAD NOTES FOR THIS STORE
  --------------------------------------------------------- */
  useEffect(() => {
    if (!storeId) return;

    setLoading(true);

    const qy = query(
      collection(db, "notes"),
      where("storeId", "==", String(storeId))
    );

    const unsub = onSnapshot(qy, (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Note[];

      rows.sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );

      setNotes(rows);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  /* ---------------------------------------------------------
     LOAD EMPLOYEES FOR THIS STORE
  --------------------------------------------------------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const coll = collection(db, "stores", String(storeId), "employees");
      const snap = await getDocs(coll);

      const rows: Person[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          uid: data.uid || d.id,
          name: data.name || "",
          role: data.role || "",
          email: data.email || "",
        };
      });

      setPeople(rows);
    })();
  }, [storeId]);

  /* ---------------------------------------------------------
     LOAD ALL USERS (ADMINS INCLUDED)
  --------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "users"));

      const rows: Person[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          uid: d.id,
          name: data.name || "",
          role: data.role || "",
          email: data.email || "",
        };
      });

      setAllUsers(rows);
    })();
  }, []);

  /* ---------------------------------------------------------
     SEND NOTE
  --------------------------------------------------------- */
  async function sendNote() {
    const clean = text.trim();
    if (!clean || !storeId) return;

    if (!selectedRecipient) {
      alert("Choose who to send this to.");
      return;
    }

    const recipient = people.find((p) => p.uid === selectedRecipient);
    if (!recipient) {
      alert("Recipient not found.");
      return;
    }

    setSending(true);

    try {
      await addDoc(collection(db, "notes"), {
        text: clean,
        fromRole: "admin",
        toRole: recipient.role || "employee",
        targetUid: recipient.uid,
        storeId,
        createdBy: auth.currentUser?.uid ?? null,
        createdAt: serverTimestamp(),
      });

      setText("");
    } catch (e) {
      alert("Could not send note.");
    } finally {
      setSending(false);
    }
  }

  /* ---------------------------------------------------------
     DELETE NOTE
  --------------------------------------------------------- */
  async function removeNote(id: string) {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteDoc(doc(db, "notes", id));
    } catch {
      alert("Could not remove note.");
    }
  }

  /* ---------------------------------------------------------
     UI
  --------------------------------------------------------- */
  if (!storeId)
    return (
      <main className="mx-auto max-w-3xl p-6">
        Missing ?store=STORE_ID
      </main>
    );

  return (
    <main className="admin-notes mx-auto max-w-3xl p-4 lg:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Store Notes</h1>

        <Link
          href={`/admin/stores/${storeId}`}
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Store
        </Link>
      </div>

      {/* ======================================================
          NOTE TIMELINE
      ======================================================= */}
      <section className="section">
        <div className="section-title">All Store Messages</div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No messages yet.</div>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => {
              const senderName =
                resolveName(n.createdBy) || prettyRole(n.fromRole);

              const recipientName =
                resolveName(n.targetUid) || prettyRole(n.toRole);

              return (
                <li key={n.id} className="item-row">
                  <div className="min-w-0">
                    <div className="meta">
                      {senderName} → {recipientName}{" "}
                      {n.createdAt?.seconds
                        ? "• " +
                          new Date(n.createdAt.seconds * 1000).toLocaleString()
                        : ""}
                    </div>

                    <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                  </div>

                  <button
                    onClick={() => removeNote(n.id)}
                    className="link-danger"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ======================================================
          SEND MESSAGE
      ======================================================= */}
      <section className="section">
        <div className="section-title">Send a Note</div>

        <select
          value={selectedRecipient}
          onChange={(e) => setSelectedRecipient(e.target.value)}
          className="input mb-2"
        >
          <option value="">Send to…</option>

          {people.map((p) => (
            <option key={p.uid} value={p.uid}>
              {(p.name || p.email || p.uid) + " — " + prettyRole(p.role)}
            </option>
          ))}
        </select>

        <textarea
          rows={3}
          placeholder="Type your note…"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="actions">
          <button
            onClick={sendNote}
            disabled={sending || !text.trim()}
            className="btn-neutral"
          >
            Send
          </button>
        </div>
      </section>

      {/* ======================================================
          STYLES
      ======================================================= */}
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



