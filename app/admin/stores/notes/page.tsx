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

  // ------------------ NOTES ------------------
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

  // ------------------ LOAD USERS (FIXED) ------------------
  useEffect(() => {
    if (!storeId) return;

    (async () => {
      // get all users ONCE
      const usersSnap = await getDocs(collection(db, "users"));
      const userMap: Record<string, any> = {};

      usersSnap.forEach((doc) => {
        userMap[doc.id] = doc.data();
      });

      // get store employees
      const empSnap = await getDocs(
        collection(db, "stores", String(storeId), "employees")
      );

      const rows: Person[] = [];

      for (const d of empSnap.docs) {
        const data = d.data() as any;
        const u = userMap[d.id];

        rows.push({
          uid: d.id,
          name: u?.name || u?.displayName || "",
          role: data.role || "",
          email: u?.email || "",
        });
      }

      setPeople(rows);

      // also store all users for fallback
      const all: Person[] = usersSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          uid: d.id,
          name: data.name || data.displayName || "",
          role: data.role || "",
          email: data.email || "",
        };
      });

      setAllUsers(all);
    })();
  }, [storeId]);

  // ------------------ SEND NOTE ------------------
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

  // ------------------ DELETE NOTE ------------------
  async function removeNote(id: string) {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteDoc(doc(db, "notes", id));
    } catch {
      alert("Could not remove note.");
    }
  }

  if (!storeId) return <main className="p-6">Missing storeId</main>;

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-6">
      <h1 className="text-xl font-semibold">Store Notes</h1>

      {/* NOTES */}
      {loading ? (
        <p>Loading…</p>
      ) : (
        notes.map((n) => (
          <div key={n.id}>
            <div>
              {resolveName(n.createdBy)} → {resolveName(n.targetUid)}
            </div>
            <div>{n.text}</div>
          </div>
        ))
      )}

      {/* SEND */}
      <select
        value={selectedRecipient}
        onChange={(e) => setSelectedRecipient(e.target.value)}
      >
        <option value="">Send to…</option>
        {people.map((p) => (
          <option key={p.uid} value={p.uid}>
            {(p.name || p.email || p.uid) + " — " + prettyRole(p.role)}
          </option>
        ))}
      </select>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <button onClick={sendNote}>Send</button>

      <Link href={`/admin/stores/${storeId}`}>
        ← Back to Store
      </Link>
    </main>
  );
}


