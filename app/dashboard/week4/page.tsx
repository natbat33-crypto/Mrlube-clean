"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { getStoreId } from "@/lib/getStoreId";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  onSnapshot,
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
  done?: boolean;
  approved?: boolean;
  lastMs?: number;
  bestMs?: number;
  avgMs?: number;
  count?: number;
};

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

function msToClock(ms?: number): string {
  if (ms == null) return "—";
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Week4Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [week3Approved, setWeek3Approved] = useState<boolean | null>(null);

  const [baseTasks, setBaseTasks] = useState<Task[]>([]);
  const [statsById, setStatsById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  /* AUTH */
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
  }, []);

  /* WEEK 3 GATE */
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid, "sections", "week3"), (snap) => {
      setWeek3Approved(snap.exists() && snap.data()?.approved === true);
    });
  }, [uid]);

  /* LOAD TASKS */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, "modules", "week4", "tasks"), orderBy("order", "asc"))
      );
      setBaseTasks(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Partial<Task>),
        }))
      );
      setLoading(false);
    })();
  }, []);

  /* LIVE PROGRESS */
  useEffect(() => {
    if (!uid || !baseTasks.length) return;

    const unsubs = baseTasks.map((t) => {
      const key = `modules__week4__tasks__${t.id}`;
      return onSnapshot(doc(db, "users", uid, "progress", key), (snap) => {
        setStatsById((p) => ({ ...p, [t.id]: snap.data() || {} }));
      });
    });

    return () => unsubs.forEach((u) => u());
  }, [uid, baseTasks]);

  const tasks = useMemo(() => {
    return baseTasks.map((t, i) => {
      const s = statsById[t.id] || {};
      const order = t.order ?? t.sort_order ?? i + 1;
      return {
        ...t,
        order,
        done: !!s.done,
        approved: !!s.approved,
        lastMs: s.lastMs,
        bestMs: s.bestMs,
        avgMs: s.avgMs,
        count: s.count,
      };
    });
  }, [baseTasks, statsById]);

  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  /* WRITE SECTION COMPLETION + EMAIL TRAINER */
  useEffect(() => {
    if (!uid || !tasks.length) return;
    if (!tasks.every((t) => t.done)) return;

    // Write section completion (unchanged)
    setDoc(
      doc(db, "users", uid, "sections", "week4"),
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
            subject: `${traineeName} completed Week 4`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0b3d91;padding:20px 24px;">
                  <h2 style="color:#FFC20E;margin:0;">Mr Lube Training</h2>
                </div>
                <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;">
                  <p>Hi,</p>
                  <p>Your trainee <strong>${traineeName}</strong> has completed
                     <strong>Week 4</strong> on <strong>${completedDate}</strong>.</p>
                  <p style="color:#555;font-size:14px;">
                    Please log in to the Mr Lube Training portal to review their progress
                    and approve Week 4 when ready.
                  </p>
                </div>
              </div>
            `,
          },
        });
      } catch (e) {
        console.warn("[week4 notify] email failed:", e);
      }
    })();
  }, [uid, tasks]);

  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;
    const storeId = await getStoreId();
    const key = `modules__week4__tasks__${id}`;

    await setDoc(
      doc(db, "users", uid, "progress", key),
      {
        week: "week4",
        done: next,
        storeId: storeId || "",
        traineeId: uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (authLoading || loading || week3Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  const locked = !week3Approved;

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

      <h2>Week 4</h2>

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

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {tasks.map((t) => {
          const isApprovalTask = t.order === 1;
          const done = t.done;

          return (
            <li
              key={t.id}
              style={{
                display: "flex",
                gap: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fff",
                border: `1px solid ${done ? "#d6ead8" : GRAY}`,
                position: "relative",
                opacity: locked ? 0.6 : 1,
                pointerEvents: locked ? "none" : "auto",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 5,
                  background: done ? GREEN : "transparent",
                  borderTopLeftRadius: 12,
                  borderBottomLeftRadius: 12,
                }}
              />

              <button
                onClick={() => toggleTask(t.id, !done)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `2px solid ${done ? GREEN : "#9aa0a6"}`,
                  background: done ? GREEN : "#fff",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  stroke={done ? "#fff" : "transparent"}
                  strokeWidth="3"
                  fill="none"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>

              <div>
                <div style={{ fontWeight: 600 }}>
                  {t.order}. {t.title}
                </div>

                {isApprovalTask ? (
                  <div style={{ fontSize: 12, color: "#5f6368" }}>
                    {t.approved ? "Approved ✓" : "Waiting for supervisor approval"}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: "#5f6368" }}>
                    Last: {msToClock(t.lastMs)} • Best: {msToClock(t.bestMs)} • Avg:{" "}
                    {msToClock(t.avgMs)} • Runs: {t.count ?? 0}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

