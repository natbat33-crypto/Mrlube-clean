"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

/* ---------------------------------------------------------
   TYPES
--------------------------------------------------------- */
type Ts = { seconds?: number } | null | undefined;

type Note = {
  id: string;
  text?: string;
  fromRole?: string;
  toRole?: string;
  fromName?: string;
  toName?: string;
  targetUid?: string;
  createdBy?: string;
  createdAt?: Ts;
  storeId?: string;
  source?: "root" | "store";
};

type SimpleUser = {
  uid: string;
  email: string;
  name?: string;
  role?: string;
};

type RecipientType = "admin" | "trainer" | "trainee";

/* ---------------------------------------------------------
   PAGE START
--------------------------------------------------------- */
export default function ManagerNotesPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [admins, setAdmins] = useState<SimpleUser[]>([]);
  const [trainers, setTrainers] = useState<SimpleUser[]>([]);
  const [trainees, setTrainees] = useState<SimpleUser[]>([]);
  const [globalUsers, setGlobalUsers] = useState<SimpleUser[]>([]);

  const [notes, setNotes] = useState<Note[]>([]);

  const [recipientType, setRecipientType] =
    useState<RecipientType>("admin");
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  /* ---------------------------------------------------------
     DETECT STORE (Bulletproof)
  --------------------------------------------------------- */
  useEffect(() => {
    const stop = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setStoreId(null);
        setLoading(false);
        return;
      }

      let sid: string | null = null;

      // 1. Token claims
      const token = await u.getIdTokenResult(true);
      sid = (token.claims?.storeId as string) || null;

      // 2. store via managerUid
      if (!sid) {
        const snap = await getDocs(
          query(collection(db!, "stores"), where("managerUid", "==", u.uid))
        );
        if (!snap.empty) sid = snap.docs[0].id;
      }

      // 3. find via employees
      if (!sid) {
        const storesSnap = await getDocs(collection(db!, "stores"));
        for (const s of storesSnap.docs) {
          const empSnap = await getDocs(
            collection(db!, "stores", s.id, "employees")
          );
          const found = empSnap.docs.find(
            (d) =>
              (d.data() as any).uid === u.uid &&
              (d.data() as any).role === "manager"
          );
          if (found) {
            sid = s.id;
            break;
          }
        }
      }

      setStoreId(sid);
      setLoading(false);
    });

    return () => stop();
  }, []);

  /* ---------------------------------------------------------
     LOAD GLOBAL USERS (for name lookup)
--------------------------------------------------------- */
  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db!, "users"));
      const rows: SimpleUser[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          uid: d.id,
          email: data.email,
          name: data.name,
          role: data.role,
        };
      });
      setGlobalUsers(rows);
    }
    load();
  }, []);

  /* ---------------------------------------------------------
     LOAD ADMINS
  --------------------------------------------------------- */
  useEffect(() => {
    async function load() {
      const snap = await getDocs(
        query(collection(db!, "users"), where("role", "==", "admin"))
      );
      setAdmins(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: d.id,
            email: data.email,
            name: data.name,
            role: "admin",
          };
        })
      );
    }
    load();
  }, []);

  /* ---------------------------------------------------------
     LOAD TRAINERS + TRAINEES
--------------------------------------------------------- */
  useEffect(() => {
    if (!storeId) return;
    const sid = storeId;

    async function load() {
      const base = collection(db!, "stores", sid, "employees");

      const [supSnap, trSnap] = await Promise.all([
        getDocs(query(base, where("role", "==", "supervisor"))),
        getDocs(query(base, where("role", "==", "trainee"))),
      ]);

      setTrainers(
        supSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: data.uid ?? d.id,
            email: data.email,
            name: data.name,
            role: "trainer", // display as trainer
          };
        })
      );

      setTrainees(
        trSnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            uid: data.uid ?? d.id,
            email: data.email,
            name: data.name,
            role: data.role ?? "trainee",
          };
        })
      );
    }

    load();
  }, [storeId]);

  /* ---------------------------------------------------------
     UNIFIED NOTES FEED
--------------------------------------------------------- */
  useEffect(() => {
    if (!storeId) return;

    let root: Note[] = [];
    let store: Note[] = [];

    function publish() {
      const merged = [...root, ...store].sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );
      setNotes(merged);
    }

    const qRoot = query(
      collection(db!, "notes"),
      where("storeId", "==", storeId)
    );
    const unsubRoot = onSnapshot(qRoot, (snap) => {
      root = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        source: "root" as const,
      }));
      publish();
    });

    const qStore = query(collection(db!, "stores", storeId, "notes"));
    const unsubStore = onSnapshot(qStore, (snap) => {
      store = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
        source: "store" as const,
      }));
      publish();
    });

    return () => {
      unsubRoot();
      unsubStore();
    };
  }, [storeId]);

  /* ---------------------------------------------------------
     NAME HELPER (GLOBAL)
--------------------------------------------------------- */
  function findName(uid?: string): string {
    if (!uid) return "";

    const merged = [
      ...globalUsers,
      ...admins,
      ...trainers,
      ...trainees,
    ];

    const p = merged.find((x) => x.uid === uid);

    return p?.name || p?.email || uid;
  }

  /* ---------------------------------------------------------
     ROLE DISPLAY
--------------------------------------------------------- */
  function prettyRole(r?: string) {
    if (!r) return "Unknown";
    if (r === "supervisor") return "Trainer";
    if (r === "trainer") return "Trainer";
    if (r === "trainee") return "Trainee";
    if (r === "manager") return "Manager";
    if (r === "admin") return "Admin";
    return r;
  }

  /* ---------------------------------------------------------
     SEND NOTE
--------------------------------------------------------- */
  async function sendNote() {
    const body = text.trim();
    if (!body || !selectedRecipient || !storeId) return;

    setSaving(true);
    const fromUid = auth.currentUser?.uid ?? null;

    try {
      if (recipientType === "admin") {
        await addDoc(collection(db!, "notes"), {
          text: body,
          fromRole: "manager",
          toRole: "admin",
          targetUid: selectedRecipient,
          storeId,
          createdBy: fromUid,
          createdAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db!, "stores", storeId, "notes"), {
          text: body,
          fromRole: "manager",
          toRole: recipientType === "trainer" ? "supervisor" : "trainee",
          targetUid: selectedRecipient,
          storeId,
          createdBy: fromUid,
          createdAt: serverTimestamp(),
        });
      }
      setText("");
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------
     REMOVE NOTE
--------------------------------------------------------- */
  async function removeNote(id: string) {
    if (!confirm("Remove this note?")) return;
    if (!storeId) return;

    try {
      await deleteDoc(doc(db!, "notes", id)).catch(() => {});
      await deleteDoc(doc(db!, "stores", storeId, "notes", id)).catch(() => {});
    } catch {
      alert("Could not remove note.");
    }
  }

  /* ---------------------------------------------------------
     RENDER
--------------------------------------------------------- */
  if (loading) {
    return <main className="p-6">Loading…</main>;
  }

  const list =
    recipientType === "admin"
      ? admins
      : recipientType === "trainer"
      ? trainers
      : trainees;

  return (
    <main className="mx-auto max-w-3xl p-4 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-semibold">Notes</h1>
        <Link
          href="/manager"
          className="text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
        >
          ← Back
        </Link>
      </div>

      {/* SEND NOTE */}
      <section className="border rounded-xl p-4 space-y-4 bg-white shadow-sm">
        <h2 className="text-sm font-medium">Send a new note</h2>

        <div className="grid gap-3 md:grid-cols-2">
          
          {/* SEND TO */}
          <div className="flex flex-col text-sm">
            Send to
            <div className="relative">
              <select
                value={recipientType}
                onChange={(e) => {
                  setRecipientType(e.target.value as RecipientType);
                  setSelectedRecipient("");
                }}
                className="border rounded-xl px-3 py-2 mt-1 text-sm bg-white w-full appearance-none pr-8"
              >
                <option value="admin">Admin</option>
                <option value="trainer">Trainer</option>
                <option value="trainee">Trainee</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                ▼
              </span>
            </div>
          </div>

          {/* RECIPIENT */}
          <div className="flex flex-col text-sm">
            Recipient
            <div className="relative">
              <select
                value={selectedRecipient}
                onChange={(e) => setSelectedRecipient(e.target.value)}
                className="border rounded-xl px-3 py-2 mt-1 text-sm bg-white w-full appearance-none pr-8"
              >
                <option value="">
                  {list.length ? "Select recipient…" : "No users available"}
                </option>
                {list.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {findName(u.uid)} — {prettyRole(u.role)}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                ▼
              </span>
            </div>
          </div>

        </div>

        <textarea
          rows={3}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Type your note…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="flex justify-end">
          <button
            disabled={!text.trim() || !selectedRecipient || saving}
            onClick={sendNote}
            className="border rounded-full px-4 py-1.5 text-sm bg-white"
          >
            {saving ? "Sending…" : "Send"}
          </button>
        </div>
      </section>

      {/* NOTES FEED */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium">Store notes</h2>

        {notes.length === 0 ? (
          <div className="text-sm text-gray-500">No messages yet.</div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {notes.map((n) => (
              <div
                key={n.id}
                className="border rounded-lg p-2.5 bg-white shadow-sm text-sm"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium">
                      {findName(n.createdBy)} ({prettyRole(n.fromRole)}) →{" "}
                      {findName(n.targetUid)} ({prettyRole(n.toRole)})
                    </div>

                    <div className="text-xs text-gray-500">
                      {n.createdAt?.seconds
                        ? new Date(n.createdAt.seconds * 1000).toLocaleString()
                        : "—"}{" "}
                      {n.source === "root" ? "(Admin channel)" : ""}
                    </div>
                  </div>

                  <button
                    onClick={() => removeNote(n.id)}
                    className="text-red-500 text-[11px] hover:underline"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-1.5 text-[13px] leading-snug whitespace-pre-wrap">
                  {n.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

