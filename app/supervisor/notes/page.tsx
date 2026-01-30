// app/supervisor/notes/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getDocs,
  getDoc,
} from "firebase/firestore";

type Note = {
  id: string;
  text?: string;
  fromRole?: string;
  toRole?: string;
  storeId?: string | number;
  targetUid?: string;
  traineeId?: string;
  supervisorId?: string;
  createdBy?: string;
  fromEmail?: string | null;
  createdAt?: { seconds?: number; nanoseconds?: number } | null;
};

type TraineeOption = {
  id: string;   // trainee UID
  label: string; // what we show in the dropdown (email/name)
};

/* ---------------- helpers ---------------- */

async function resolveStoreIdFromAuth(): Promise<string | null> {
  const u = auth.currentUser;
  if (!u) return null;
  const tok = await u.getIdTokenResult(true);
  const claim = tok?.claims?.storeId;
  return claim ? String(claim) : null;
}

/** Manager → Supervisor panel (reads stores/{storeId}/notes, sorts client-side) */
function ManagerNotesPanel({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<Note[]>([]);

  useEffect(() => {
    if (!storeId) return;

    const base = collection(db, "stores", String(storeId), "notes");
    const qMgr = query(
      base,
      where("fromRole", "==", "manager"),
      where("toRole", "==", "supervisor")
    );

    const unsub = onSnapshot(qMgr, (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Note[];

      rows.sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );
      setItems(rows);
    });

    return () => unsub();
  }, [storeId]);

  async function removeNote(id: string) {
    await deleteDoc(doc(db, "stores", String(storeId), "notes", id));
  }

  if (!items.length) {
    return (
      <div className="text-sm text-muted-foreground">
        No notes from manager.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li key={n.id} className="item-row">
          <div className="min-w-0">
            <div className="meta">
              manager → supervisor
              {n.createdAt?.seconds
                ? " • " +
                  new Date(n.createdAt.seconds * 1000).toLocaleString()
                : ""}
            </div>
            <div className="text-sm leading-5 whitespace-pre-wrap">
              {n.text ?? ""}
            </div>
          </div>
          <button onClick={() => removeNote(n.id)} className="link-danger">
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- page ---------------- */

export default function SupervisorNotesPage() {
  const params = useSearchParams();
  const storeFromLink = params.get("store");

  const [storeId, setStoreId] = useState<string | null>(
    storeFromLink ? String(storeFromLink) : null
  );
  const [meUid, setMeUid] = useState<string | null>(
    auth.currentUser?.uid ?? null
  );

  // dropdown options + current selection
  const [traineeOptions, setTraineeOptions] = useState<TraineeOption[]>([]);
  const [traineeUid, setTraineeUid] = useState<string | null>(null);

  // composers
  const [noteTextMgr, setNoteTextMgr] = useState("");
  const [noteTextTrainee, setNoteTextTrainee] = useState("");
  const [sendingMgr, setSendingMgr] = useState(false);
  const [sendingTrainee, setSendingTrainee] = useState(false);

  const [sentNotes, setSentNotes] = useState<Note[]>([]);

  /* ----- resolve store / supervisor from auth (when ?store not provided) ----- */
  useEffect(() => {
    if (storeFromLink) return;

    let mounted = true;
    const stop = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        if (mounted) {
          setStoreId(null);
          setMeUid(null);
        }
        return;
      }
      if (mounted) setMeUid(u.uid);
      const sid = await resolveStoreIdFromAuth();
      if (mounted) setStoreId(sid);
    });

    return () => {
      mounted = false;
      stop();
    };
  }, [storeFromLink]);

  /* ----- load saved trainee selection (so it remembers between visits) ----- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("supNotesTrainee");
    if (saved) setTraineeUid(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (traineeUid) localStorage.setItem("supNotesTrainee", traineeUid);
  }, [traineeUid]);

  /* ----- build trainee dropdown (FIX: resolve name/email from users/{uid}) ----- */
  useEffect(() => {
    (async () => {
      if (!storeId || !meUid) return;

      const base = collection(db, "stores", String(storeId), "trainees");
      const qs = await getDocs(
        query(
          base,
          where("active", "==", true),
          where("supervisorId", "==", meUid)
        )
      );

      const options: TraineeOption[] = [];

      for (const d of qs.docs) {
        const data = d.data() as any;

        // ✅ FIX: support either doc.id OR traineeId field
        const traineeId = String(data.traineeId || d.id);

        // ✅ FIX: pull display info from users/{traineeId}
        let uName: string | null = null;
        let uEmail: string | null = null;

        try {
          const userSnap = await getDoc(doc(db, "users", traineeId));
          const u = userSnap.exists() ? (userSnap.data() as any) : null;
          uName = u?.displayName || u?.name || null;
          uEmail = u?.email || null;
        } catch {
          // ignore, fallback below
        }

        let label = traineeId;
        if (uEmail && uName) label = `${uName} — ${uEmail}`;
        else if (uEmail) label = uEmail;
        else if (uName) label = `${uName} — ${traineeId}`;

        options.push({ id: traineeId, label });
      }

      setTraineeOptions(options);

      if (!options.length) {
        setTraineeUid(null);
      } else if (!traineeUid || !options.some((o) => o.id === traineeUid)) {
        setTraineeUid(options[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, meUid]);

  /* ----- send: supervisor → manager (stores/{storeId}/notes) ----- */
  async function sendToManager() {
    const clean = noteTextMgr.trim();
    if (!clean || !storeId) return;

    const user = auth.currentUser;
    if (!user) return;

    setSendingMgr(true);
    try {
      await addDoc(collection(db, "stores", String(storeId), "notes"), {
        storeId: String(storeId),
        createdBy: user.uid,
        fromUid: user.uid,
        fromEmail: user.email ?? null,
        fromRole: "supervisor",
        toRole: "manager",
        text: clean,
        createdAt: serverTimestamp(),
      });
      setNoteTextMgr("");
    } finally {
      setSendingMgr(false);
    }
  }

  /* ----- send: supervisor → trainee (stores/{storeId}/notes) ----- */
  async function sendToTrainee() {
    const clean = noteTextTrainee.trim();
    if (!clean || !storeId || !traineeUid) return;

    const user = auth.currentUser;
    if (!user) return;

    setSendingTrainee(true);
    try {
      await addDoc(collection(db, "stores", String(storeId), "notes"), {
        storeId: String(storeId),
        traineeId: traineeUid,
        targetUid: traineeUid,
        supervisorId: user.uid,
        createdBy: user.uid,
        fromUid: user.uid,
        fromEmail: user.email ?? null,
        fromRole: "supervisor",
        toRole: "trainee",
        text: clean,
        createdAt: serverTimestamp(),
      });
      setNoteTextTrainee("");
    } finally {
      setSendingTrainee(false);
    }
  }

  /* ----- list: notes supervisor sent to the selected trainee ----- */
  useEffect(() => {
    if (!storeId || !traineeUid) {
      setSentNotes([]);
      return;
    }

    const base = collection(db, "stores", String(storeId), "notes");

    const qTarget = query(
      base,
      where("toRole", "==", "trainee"),
      where("targetUid", "==", traineeUid)
    );

    const qLegacy = query(
      base,
      where("toRole", "==", "trainee"),
      where("traineeId", "==", traineeUid)
    );

    const u1 = onSnapshot(qTarget, (snap) => {
      const a = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Note[];
      setSentNotes((prev) => {
        const m = new Map<string, Note>();
        [...a, ...prev].forEach((x) => m.set(x.id, x));
        return Array.from(m.values()).sort(
          (x, y) => (y.createdAt?.seconds ?? 0) - (x.createdAt?.seconds ?? 0)
        );
      });
    });

    const u2 = onSnapshot(qLegacy, (snap) => {
      const b = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as Note[];
      setSentNotes((prev) => {
        const m = new Map<string, Note>();
        [...prev, ...b].forEach((x) => m.set(x.id, x));
        return Array.from(m.values()).sort(
          (x, y) => (y.createdAt?.seconds ?? 0) - (x.createdAt?.seconds ?? 0)
        );
      });
    });

    return () => {
      u1();
      u2();
    };
  }, [storeId, traineeUid]);

  async function handleRemove(id: string) {
    if (!storeId) return;
    await deleteDoc(doc(db, "stores", String(storeId), "notes", id));
  }

  /* ---------------- render ---------------- */

  return (
    <main className="sup-notes mx-auto max-w-3xl p-4 lg:p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notes</h1>
        <Link
          href="/supervisor"
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* Manager → Supervisor */}
      <section className="section">
        <div className="section-title">From Manager</div>
        {storeId ? (
          <ManagerNotesPanel storeId={storeId} />
        ) : (
          <div className="text-sm text-muted-foreground">
            Missing store selection. Open from your dashboard or add ?store=ID.
          </div>
        )}
      </section>

      {/* Reply to Manager */}
      <section className="section">
        <div className="section-title">Reply to Manager</div>
        <div className="composer">
          <textarea
            rows={3}
            className="input"
            placeholder="Type your note…"
            value={noteTextMgr}
            onChange={(e) => setNoteTextMgr(e.target.value)}
          />
          <div className="actions">
            <button
              onClick={sendToManager}
              disabled={sendingMgr || !noteTextMgr.trim()}
              className="btn-neutral disabled:opacity-50"
            >
              {sendingMgr ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </section>

      {/* Supervisor → Trainee */}
      <section className="section">
        <div className="section-title">Notes to Trainee</div>

        {!storeId ? (
          <div className="text-sm text-muted-foreground">
            Missing store selection. Open from your dashboard or add ?store=ID.
          </div>
        ) : !traineeOptions.length ? (
          <div className="text-sm text-muted-foreground">
            No trainees assigned yet.
          </div>
        ) : (
          <>
            {/* trainee selector with email labels */}
            <div className="mb-2 text-xs text-muted-foreground">
              Select trainee
            </div>
            <select
              className="mb-3 w-full rounded-md border px-3 py-2 text-sm bg-white"
              value={traineeUid ?? ""}
              onChange={(e) =>
                setTraineeUid(e.target.value || null)
              }
            >
              {traineeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>

            {traineeUid && (
              <>
                <div className="composer">
                  <textarea
                    rows={3}
                    className="input"
                    placeholder="Type your note…"
                    value={noteTextTrainee}
                    onChange={(e) => setNoteTextTrainee(e.target.value)}
                  />
                  <div className="actions">
                    <button
                      onClick={sendToTrainee}
                      disabled={sendingTrainee || !noteTextTrainee.trim()}
                      className="btn-neutral disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>

                {/* Sent list */}
                <div className="mt-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                    Notes you sent
                  </div>
                  {sentNotes.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No notes yet.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {sentNotes.map((n) => (
                        <li key={n.id} className="item-row">
                          <div className="min-w-0">
                            <div className="text-sm leading-5 whitespace-pre-wrap">
                              {n.text ?? ""}
                            </div>
                            {n.createdAt?.seconds && (
                              <div className="meta mt-1">
                                {new Date(
                                  n.createdAt.seconds * 1000
                                ).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemove(n.id)}
                            className="link-danger"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* Styles aligned with manager page */}
      <style jsx global>{`
        .sup-notes {
          --line: #eaecef;
          --muted: #f8f9fb;
        }
        .sup-notes .section {
          padding: 12px 0 18px 0;
          border-top: 1px solid var(--line);
        }
        .sup-notes .section:first-of-type {
          border-top: none;
          padding-top: 0;
        }
        .sup-notes .section-title {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 8px;
        }
        .sup-notes .composer {
          margin-top: 10px;
        }
        .sup-notes .input {
          width: 100%;
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 14px;
          resize: vertical;
        }
        .sup-notes .actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 8px;
        }
        .sup-notes .btn-neutral {
          border: 1px solid var(--line);
          background: #fff;
          color: #111;
          padding: 6px 12px;
          font-size: 13px;
          border-radius: 8px;
        }
        .sup-notes .btn-neutral:hover {
          background: var(--muted);
        }
        .sup-notes .item-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border: 1px solid var(--line);
          background: #fff;
          border-radius: 10px;
        }
        .sup-notes .meta {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .sup-notes .link-danger {
          color: #ef4444;
          font-size: 12px;
          line-height: 1;
          padding-top: 2px;
        }
        .sup-notes .link-danger:hover {
          color: #dc2626;
          text-decoration: underline;
        }
      `}</style>
    </main>
  );
}






