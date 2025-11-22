// app/dashboard/day-1/page.tsx (or your file path)
// ✅ uses the shared Firebase instance; safe for prod
'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection, getDocs, getDoc, updateDoc, setDoc, doc,
  serverTimestamp, deleteField
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
  done?: boolean;
};

const YELLOW = "#FFC20E";
const NAVY   = "#0b3d91";
const GREEN  = "#2e7d32";
const GRAY   = "#e9e9ee";

// TODO: replace with your real store selector / profile field
const currentStoreId = "STORE_001";

/** number coercion */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function Day1Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [pageTitle, setPageTitle] = useState("Day 1 Orientation");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ real auth uid via shared auth instance
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Load base tasks + title
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const dayDoc = await getDoc(doc(db, "days", "day-1"));
        if (alive && dayDoc.exists()) {
          const data = dayDoc.data() as Record<string, any>;
          const t = data.title || data.name;
          if (t) setPageTitle(t);
        }
        const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
        const list: Task[] = snap.docs
          .map(d => ({ id: d.id, ...(d.data() as Partial<Task>) }))
          .sort((a, b) => num(a.order ?? a.sort_order) - num(b.order ?? b.sort_order));

        if (alive) { setTasks(list); setErr(null); }
      } catch (e: any) {
        if (alive) { console.error(e); setErr(e.message ?? String(e)); setTasks([]); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function toggleTask(id: string, next: boolean) {
    if (!uid) { alert("Please log in to save your progress."); return; }

    // optimistic UI
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, done: next } : t)));

    try {
      // Shared task (may be blocked by prod rules) — ignore failures
      try {
        await updateDoc(doc(db, "days", "day-1", "tasks", id), {
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
        });
      } catch {}

      // ✅ Per-user progress WITH context fields supervisors need (read only)
      const path = `days/day-1/tasks/${id}`;
      const key  = path.replace(/\//g, "__");
      const t    = tasks.find(x => x.id === id);

      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          path,                 // "days/day-1/tasks/<id>"
          week: "day-1",
          title: t?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),

          // 🔑 supervisor-read authorization context
          storeId: currentStoreId,
          traineeId: uid,
          createdBy: uid,
        },
        { merge: true }
      );
    } catch {
      // rollback on error
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, done: !next } : t)));
      alert("Failed to save. Check Firestore rules and try again.");
    }
  }

  const doneCount = useMemo(() => tasks.filter(t => t.done).length, [tasks]);
  const pct = useMemo(
    () => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0),
    [doneCount, tasks.length]
  );

  if (authLoading || loading) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            background: "#fff",
            border: `1px solid ${GRAY}`,
            borderRadius: 999,
            padding: "8px 14px",
            fontWeight: 600,
            color: NAVY,
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <span aria-hidden>←</span> Back to Dashboard
        </Link>
      </div>

      <h2 style={{ margin: "0 0 6px 0" }}>{pageTitle} — Tasks</h2>
      <div style={{ fontSize: 14, marginBottom: 6, color: "#000" }}>
        {doneCount}/{tasks.length} completed ({pct}%)
      </div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
           style={{height:12,width:"100%",background:"#d9d9df",borderRadius:999,overflow:"hidden",marginBottom:18}}>
        <div style={{height:"100%",width:`${pct}%`,background:YELLOW,transition:"width 220ms ease"}} />
      </div>

      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
        {tasks.map((t, idx) => {
          const order = (t.order ?? t.sort_order ?? (idx + 1)) as number;
          const done = !!t.done;
          return (
            <li key={t.id}
                style={{
                  display:"flex",alignItems:"center",gap:14,padding:"12px 14px",
                  borderRadius:12,background:"#fff",border:`1px solid ${done ? "#d6ead8" : GRAY}`,
                  boxShadow: done ? "0 1px 2px rgba(0,0,0,0.04)" : "0 1px 2px rgba(0,0,0,0.03)",
                  position:"relative"
                }}>
              <span aria-hidden
                    style={{position:"absolute",left:0,top:0,bottom:0,width:5,
                            background:done?GREEN:"transparent",
                            borderTopLeftRadius:12,borderBottomLeftRadius:12}}/>
              <button
                aria-label={done ? "Mark incomplete" : "Mark complete"}
                onClick={() => toggleTask(t.id, !done)}
                style={{
                  width:22,height:22,borderRadius:"50%",border:`2px solid ${done?GREEN:"#9aa0a6"}`,
                  display:"grid",placeItems:"center",background:done?GREEN:"#fff",cursor:"pointer",flex:"0 0 auto"
                }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                     stroke={done?"#fff":"transparent"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>

              <div style={{ opacity: done ? 0.9 : 1 }}>
                <div style={{ fontWeight: 600, color: "#111" }}>
                  {order}. {t.title ?? t.id}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}


