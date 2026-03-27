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
  const [allUsers, setAllUsers] = useState<Person[]>([]);

  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  function prettyRole(r?: string) {
    if (!r) return "Unknown";
    if (r === "supervisor") return "Trainer";
    if (r === "manager") return "Manager";
    if (r === "trainee") return "Trainee";
    if (r === "admin") return "Admin";
    return r;
  }

  function resolveName(uid?: string | null) {
    if (!uid) return null;

    let p = people.find((x) => x.uid === uid);
    if (!p) p = allUsers.find((x) => x.uid === uid);

    if (!p) return null;
    return p.name?.trim() ? p.name : p.email || null;
  }

  /* ---------------- NOTES ---------------- */
  useEffect(() => {
    if (!storeId) return;

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

  /* ---------------- FIXED EMPLOYEES LOAD ---------------- */
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      const rows: Person[] = [];

      // get ALL users once
      const usersSnap = await getDocs(collection(db, "users"));
      const userMap: Record<string, any> = {};

      usersSnap.forEach((doc) => {
        userMap[doc.id] = doc.data();
      });

      // get employees
      const empSnap = await getDocs(
        collection(db, "stores", String(storeId), "employees")
      );

      for (const emp of empSnap.docs) {
        const data = emp.data() as any;
        const u = userMap[emp.id];

        rows.push({
          uid: emp.id,
          name: u?.displayName || u?.name || "",
          role: data.role || "",
          email: u?.email || "",
        });
      }

      setPeople(rows);
    })();
  }, [storeId]);

  /* ---------------- ALL USERS (unchanged) ---------------- */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "users"));

      const rows: Person[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          uid: d.id,
          name: data.name || data.displayName || "",
          role: data.role || "",
          email: data.email || "",
        };
      });

      setAllUsers(rows);
    })();
  }, []);

  /* ---------------- SEND NOTE ---------------- */
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
    } catch {
      alert("Could not send note.");
    } finally {
      setSending(false);
    }
  }

  /* ---------------- DELETE NOTE ---------------- */
  async function removeNote(id: string) {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteDoc(doc(db, "notes", id));
    } catch {
      alert("Could not remove note.");
    }
  }

  /* ---------------- UI (UNCHANGED) ---------------- */
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
                      {senderName} → {recipientName}
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
    </main>
  );
}

