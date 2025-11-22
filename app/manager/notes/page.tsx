// app/manager/notes/page.tsx
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
  getDoc
} from "firebase/firestore";

type Note = {
  id: string;
  text: string;
  fromRole: string;
  toRole: string;
  storeId?: string;
  targetUid?: string;
  createdBy?: string;
  createdAt?: { seconds?: number; nanoseconds?: number } | null;
};

export default function ManagerNotesPage() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [admins, setAdmins] = useState<{ uid: string; email: string }[]>([]);
  const [supervisors, setSupervisors] = useState<{ uid: string; email: string }[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");

  const [adminNotes, setAdminNotes] = useState<Note[]>([]);
  const [supNotes, setSupNotes] = useState<Note[]>([]);

  const [textAdmin, setTextAdmin] = useState("");
  const [textSup, setTextSup] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------
  //   FIX #1 — BULLETPROOF STOREID DETECTION
  // ---------------------------------------------------------
  useEffect(() => {
    const stop = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setStoreId(null);
        setLoading(false);
        return;
      }

      let sid: string | null = null;

      // 1) Try token claims
      const token = await u.getIdTokenResult(true);
      sid = (token.claims?.storeId as string) || null;

      // 2) Try stores → managerUid
      if (!sid) {
        const snap = await getDocs(
          query(collection(db, "stores"), where("managerUid", "==", u.uid))
        );
        if (!snap.empty) sid = snap.docs[0].id;
      }

      // 3) Try employees table (manager inside store employees)
      if (!sid) {
        const storesSnap = await getDocs(collection(db, "stores"));
        for (const s of storesSnap.docs) {
          const empSnap = await getDocs(
            collection(db, "stores", s.id, "employees")
          );
          const found = empSnap.docs.find(
            (e) => (e.data() as any).uid === u.uid && (e.data() as any).role === "manager"
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

  // ---------------------------------------------------------
  //   Load admins
  // ---------------------------------------------------------
  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(
        query(collection(db, "users"), where("role", "==", "admin"))
      );
      setAdmins(
        snap.docs.map((d) => ({
          uid: d.id,
          email: (d.data() as any).email,
        }))
      );
    };
    load();
  }, []);

  // ---------------------------------------------------------
  //   Load supervisors (FIXED)
  // ---------------------------------------------------------
  useEffect(() => {
    if (!storeId) return;

    const load = async () => {
      const snap = await getDocs(
        query(
          collection(db, "stores", storeId, "employees"),
          where("role", "==", "supervisor"),
          where("active", "==", true)
        )
      );

      setSupervisors(
        snap.docs.map((d) => ({
          uid: (d.data() as any).uid,
          email: (d.data() as any).email,
        }))
      );
    };

    load();
  }, [storeId]);

  // ---------------------------------------------------------
  //   Admin → Manager notes
  // ---------------------------------------------------------
  useEffect(() => {
    if (!storeId) return;
    const qy = query(
      collection(db, "notes"),
      where("toRole", "==", "manager"),
      where("storeId", "==", storeId)
    );
    const unsub = onSnapshot(qy, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      rows.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setAdminNotes(rows);
    });
    return () => unsub();
  }, [storeId]);

  // ---------------------------------------------------------
  //   Manager ↔ Supervisor notes
  // ---------------------------------------------------------
  useEffect(() => {
    if (!storeId) return;

    const base = collection(db, "stores", storeId, "notes");

    const qToSup = query(
      base,
      where("fromRole", "==", "manager"),
      where("toRole", "==", "supervisor")
    );

    const qFromSup = query(
      base,
      where("fromRole", "==", "supervisor"),
      where("toRole", "==", "manager")
    );

    let a: Note[] = [];
    let b: Note[] = [];

    const publish = () => {
      const map = new Map<string, Note>();
      [...a, ...b].forEach((n) => map.set(n.id, n));
      const merged = Array.from(map.values()).sort(
        (x, y) => (y.createdAt?.seconds ?? 0) - (x.createdAt?.seconds ?? 0)
      );
      setSupNotes(merged);
    };

    const u1 = onSnapshot(qToSup, (snap) => {
      a = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      publish();
    });

    const u2 = onSnapshot(qFromSup, (snap) => {
      b = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      publish();
    });

    return () => {
      u1();
      u2();
    };
  }, [storeId]);

  // ---------------------------------------------------------
  //   Remove note
  // ---------------------------------------------------------
  async function removeNote(id: string) {
    if (!confirm("Remove this note?")) return;

    try {
      await deleteDoc(doc(db, "notes", id)).catch(() => Promise.resolve());
      if (storeId) {
        await deleteDoc(doc(db, "stores", storeId, "notes", id)).catch(() =>
          Promise.resolve()
        );
      }
    } catch {
      alert("Could not remove note.");
    }
  }

  // ---------------------------------------------------------
  //   Send Note
  // ---------------------------------------------------------
  async function sendNote(
    toRole: "admin" | "supervisor",
    text: string,
    setText: (v: string) => void
  ) {
    const clean = text.trim();
    if (!clean || !storeId) return;

    setSaving(true);

    try {
      if (toRole === "supervisor") {
        if (!selectedSupervisor) {
          alert("Select a supervisor first.");
          return;
        }

        await addDoc(collection(db, "stores", storeId, "notes"), {
          text: clean,
          fromRole: "manager",
          toRole: "supervisor",
          storeId,
          targetUid: selectedSupervisor,
          createdBy: auth.currentUser?.uid ?? null,
          createdAt: serverTimestamp(),
        });
      } else {
        if (!selectedAdmin) {
          alert("Select an admin first.");
          return;
        }

        await addDoc(collection(db, "notes"), {
          text: clean,
          fromRole: "manager",
          toRole: "admin",
          storeId,
          targetUid: selectedAdmin,
          createdBy: auth.currentUser?.uid ?? null,
          createdAt: serverTimestamp(),
        });
      }

      setText("");
    } catch {
      alert("Could not send note.");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------
  //   RENDER
  // ---------------------------------------------------------
  if (loading) {
    return <main className="mx-auto max-w-3xl p-6">Loading…</main>;
  }

  return (
    <main className="mgr-notes mx-auto max-w-3xl p-4 lg:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notes</h1>
        <Link
          href="/manager"
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* ---- Admin Notes ---- */}
      <section className="section">
        <div className="section-title">From Admin</div>

        {adminNotes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No messages yet.</div>
        ) : (
          <ul className="space-y-2">
            {adminNotes.map((n) => (
              <li key={n.id} className="item-row">
                <div className="min-w-0">
                  <div className="meta">
                    {n.createdAt?.seconds
                      ? new Date(n.createdAt.seconds * 1000).toLocaleString()
                      : "—"}
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

        {/* Reply */}
        <div className="composer">
          <label className="label">Reply to Admin</label>

          <select
            value={selectedAdmin}
            onChange={(e) => setSelectedAdmin(e.target.value)}
            className="input mb-2"
          >
            <option value="">Select admin…</option>
            {admins.map((a) => (
              <option key={a.uid} value={a.uid}>
                {a.email}
              </option>
            ))}
          </select>

          <textarea
            rows={3}
            value={textAdmin}
            onChange={(e) => setTextAdmin(e.target.value)}
            placeholder="Type your note…"
            className="input"
          />

          <div className="actions">
            <button
              onClick={() => sendNote("admin", textAdmin, setTextAdmin)}
              disabled={saving || !textAdmin.trim()}
              className="btn-neutral"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {/* ---- Supervisor Notes ---- */}
      <section className="section">
        <div className="section-title">From Supervisor</div>

        {supNotes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No messages yet.</div>
        ) : (
          <ul className="space-y-2">
            {supNotes.map((n) => (
              <li key={n.id} className="item-row">
                <div className="min-w-0">
                  <div className="meta">
                    {n.fromRole} → {n.toRole}{" "}
                    {n.createdAt?.seconds
                      ? " • " +
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

        <div className="composer">
          <label className="label">Send a note to Supervisor</label>

          <select
            value={selectedSupervisor}
            onChange={(e) => setSelectedSupervisor(e.target.value)}
            className="input mb-2"
          >
            <option value="">Select supervisor…</option>
            {supervisors.map((s) => (
              <option key={s.uid} value={s.uid}>
                {s.email}
              </option>
            ))}
          </select>

          <textarea
            rows={3}
            value={textSup}
            onChange={(e) => setTextSup(e.target.value)}
            placeholder="Type your note…"
            className="input"
          />

          <div className="actions">
            <button
              onClick={() => sendNote("supervisor", textSup, setTextSup)}
              disabled={saving || !textSup.trim()}
              className="btn-neutral"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {/* Styles */}
      <style jsx global>{`
        .mgr-notes {
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
        .composer {
          margin-top: 10px;
        }
        .label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 6px;
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






