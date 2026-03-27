"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  orderBy,
  query,
  setDoc,
  doc,
  serverTimestamp,
  deleteField,
  onSnapshot,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

/* ----------------------------------
   TYPES
---------------------------------- */
type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
  required?: boolean;
  done?: boolean;
};

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

/* ----------------------------------
   MAIN
---------------------------------- */
export default function Week2Page() {
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [week1Approved, setWeek1Approved] = useState<boolean | null>(null);

  /* ---------- AUTH ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ---------- WEEK 1 GATE ---------- */
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid, "sections", "week1");
    return onSnapshot(ref, (snap) => {
      const ok = snap.exists() && snap.data()?.approved === true;
      setWeek1Approved(ok);
      if (!ok) router.replace("/dashboard");
    });
  }, [uid, router]);

  /* ---------- LOAD TASK DEFINITIONS ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const q = query(
          collection(db, "modules", "week2", "tasks"),
          orderBy("order", "asc")
        );
        const snap = await getDocs(q);
        const list: Task[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
          done: false,
        }));
        if (alive) setTasks(list);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ---------- LOAD USER PROGRESS ---------- */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;
    const q = query(
      collection(db, "users", uid, "progress"),
      where("week", "==", "week2")
    );
    return onSnapshot(q, (snap) => {
      const map: Record<string, boolean> = {};
      snap.forEach((d) => {
        const parts = d.id.split("__");
        map[parts[parts.length - 1]] = !!d.data()?.done;
      });
      setTasks((prev) => prev.map((t) => ({ ...t, done: !!map[t.id] })));
    });
  }, [uid, tasks.length]);

  /* ---------- TOGGLE TASK ---------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, done: next } : x)));
    try {
      const key = `modules__week2__tasks__${id}`;
      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          traineeId: uid,
          week: "week2",
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, done: !next } : x)));
    }
  }

  /* ---------- AUTO-CREATE sections/week2 + EMAIL TRAINER ---------- */
  useEffect(() => {
    if (!uid) return;
    const allDone = tasks.length > 0 && tasks.every((t) => t.done === true);
    if (!allDone) return;

    // Write section completion (unchanged)
    setDoc(
      doc(db, "users", uid, "sections", "week2"),
      { completed: true, completedAt: serverTimestamp() },
      { merge: true }
    );

    // Look up trainer email and send notification
    (async () => {
      try {
        const traineeSnap = await getDoc(doc(db, "users", uid));
        const traineeData = traineeSnap.data();
        const traineeName: string = traineeData?.name ?? traineeData?.email ?? "Your trainee";
        const supervisorUid: string | undefined = traineeData?.supervisorUid;
        if (!supervisorUid) return;

        const trainerSnap = await getDoc(doc(db, "users", supervisorUid));
        const trainerEmail: string | undefined = trainerSnap.data()?.email;
        if (!trainerEmail) return;

        const completedDate = new Date().toLocaleDateString("en-CA", {
          year: "numeric", month: "long", day: "numeric",
        });

        await addDoc(collection(db, "mail"), {
          to: trainerEmail,
          message: {
            subject: `${traineeName} completed Week 2`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0b3d91;padding:20px 24px;">
                  <h2 style="color:#FFC20E;margin:0;">Mr Lube Training</h2>
                </div>
                <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;">
                  <p>Hi,</p>
                  <p>Your trainee <strong>${traineeName}</strong> has completed
                     <strong>Week 2</strong> on <strong>${completedDate}</strong>.</p>
                  <p style="color:#555;font-size:14px;">
                    Please log in to the Mr Lube Training portal to review their progress
                    and approve Week 2 when ready.
                  </p>
                </div>
              </div>
            `,
          },
        });
      } catch (e) {
        console.warn("[week2 notify] email failed:", e);
      }
    })();
  }, [uid, tasks]);

  /* ---------- BLOCK ---------- */
  if (authLoading || loading || week1Approved === null) {
    return <main style={{ padding: 24 }}>Checking access…</main>;
  }

  if (week1Approved === false) {
    return <main style={{ padding: 24 }}>Access denied.</main>;
  }

  /* ---------- UI ---------- */
  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <Link
        href="/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "#fff",
          border: `1px solid ${GRAY}`,
          borderRadius: 999,
          padding: "8px 14px",
          fontWeight: 600,
          color: NAVY,
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        ← Back to Dashboard
      </Link>

      <h2>Week 2</h2>

      <div style={{ fontSize: 14, marginBottom: 6 }}>
        {doneCount}/{tasks.length} completed ({pct}%)
      </div>

      <div
        style={{
          height: 12,
          background: "#d9d9df",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 18,
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: YELLOW }} />
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {tasks.map((t, i) => (
          <li
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 14px",
              borderRadius: 12,
              background: "#fff",
              border: `1px solid ${t.done ? "#d6ead8" : GRAY}`,
            }}
          >
            <button
              onClick={() => toggleTask(t.id, !t.done)}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: `2px solid ${t.done ? GREEN : "#9aa0a6"}`,
                background: t.done ? GREEN : "#fff",
                cursor: "pointer",
              }}
            />
            <div style={{ fontWeight: 600 }}>
              {(t.order ?? t.sort_order ?? i + 1)}. {t.title}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
