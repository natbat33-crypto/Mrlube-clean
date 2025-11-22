// components/notes/NoteComposer.tsx
"use client";

import { useEffect, useState, FormEvent } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";

type FromRole = "admin" | "manager" | "supervisor";
type ToRole = "admin" | "manager" | "supervisor" | "trainee";

type Store = { id: string; number?: number; name?: string };

export default function NoteComposer({
  fromRole,
  toRole = "supervisor",
  fixedStoreId,
}: {
  fromRole: FromRole;
  toRole?: ToRole;
  fixedStoreId?: string | null;
}) {
  const [storeId, setStoreId] = useState<string>(fixedStoreId ?? "");
  const [stores, setStores] = useState<Store[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<null | string>(null);

  useEffect(() => {
    if (fixedStoreId) return;
    (async () => {
      try {
        const qy = query(collection(db, "stores"), orderBy("number", "asc"));
        const snap = await getDocs(qy);
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setStores(rows as Store[]);
      } catch (e) {
        console.error("Failed to load stores:", e);
      }
    })();
  }, [fixedStoreId]);

  useEffect(() => {
    if (fixedStoreId) setStoreId(fixedStoreId);
  }, [fixedStoreId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    if (!storeId) {
      setMsg("No store selected.");
      return;
    }

    setSaving(true);
    setMsg(null);
    try {
      await addDoc(collection(db, "notes"), {
        text: clean,
        fromRole,
        toRole,
        storeId: String(storeId), // ✅ ensure consistent string type
        createdAt: serverTimestamp(),
      });
      setText("");
      setMsg("Note sent.");
    } catch (err) {
      console.error(err);
      setMsg("Could not send note. Check console.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(null), 2000);
    }
  }

  const titleMap: Record<ToRole, string> = {
    admin: "Send a note to Admin",
    manager: "Send a note to Manager",
    supervisor: "Send a note to Supervisor",
    trainee: "Send a note to Trainee",
  };

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{titleMap[toRole]}</div>

      <form onSubmit={submit} style={{ display: "grid", gap: 8 }}>
        {!fixedStoreId && (
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Select store</span>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
            >
              <option value="">— choose a store —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number != null ? `Store #${s.number}` : s.id}
                  {s.name ? ` — ${s.name}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>Message</span>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your note…"
            style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="submit"
            disabled={saving || !text.trim() || !storeId}
            style={{
              background: "#111827",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              opacity: saving || !text.trim() || !storeId ? 0.7 : 1,
            }}
          >
            {saving ? "Sending…" : "Send note"}
          </button>
        </div>

        {msg && <div style={{ fontSize: 12, color: "#2563eb" }}>{msg}</div>}
      </form>
    </div>
  );
}



