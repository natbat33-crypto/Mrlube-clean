"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { getStoreId } from "@/lib/getStoreId";
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

type Approvals = Record<string, boolean>;

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

/* ----------------------------------
   MAIN COMPONENT
---------------------------------- */
export default function Week3Page() {
  const [uid, setUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvedById, setApprovedById] = useState<Approvals>({});
  const [weekApproved, setWeekApproved] = useState<boolean>(false);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [week2Approved, setWeek2Approved] = useState<boolean | null>(null);

  /* ----------------------------------
     AUTH
  ---------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ----------------------------------
     WEEK 2 AUTHORITY (LIVE)
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid, "sections", "week2");
    const unsub = onSnapshot(ref, (snap) => {
      setWeek2Approved(snap.exists() && snap.data()?.approved === true);
    });
    return unsub;
  }, [uid]);

  /* ----------------------------------
     LOAD WEEK 3 TASKS
  ---------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const col = collection(db, "modules", "week3", "tasks");
        const q = query(col, orderBy("order", "asc"));
        const snap = await getDocs(q);
        const list: Task[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Partial<Task>),
          done: false,
        }));
        if (alive) { setTasks(list); setErr(null); }
      } catch (e: any) {
        if (alive) { setErr(e?.message ?? String(e)); setTasks([]); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  /* ----------------------------------
     WHOLE WEEK APPROVAL
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, "users", uid, "sections", "week3");
    const unsub = onSnapshot(ref, (snap) => {
      setWeekApproved(snap.data()?.approved === true);
    });
    return unsub;
  }, [uid]);

  /* ----------------------------------
     PER-TASK APPROVALS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;
    const unsubs = tasks.map((task) => {
      const key = `modules__week3__tasks__${task.id}`;
      return onSnapshot(doc(db, "users", uid, "progress", key), (snap) => {
        setApprovedById((prev) => ({ ...prev, [task.id]: !!snap.data()?.approved }));
      });
    });
    return () => unsubs.forEach((u) => u());
  }, [uid, tasks]);

  /* ----------------------------------
     LOAD DONE FLAGS
  ---------------------------------- */
  useEffect(() => {
    if (!uid || tasks.length === 0) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, "users", uid, "progress"), where("week", "==", "week3"))
        );
        const doneMap: Record<string, boolean> = {};
        snap.forEach((d) => {
          if (!d.data()?.done) return;
          const parts = d.id.split("__");
          doneMap[parts[parts.length - 1]] = true;
        });
        setTasks((prev) => prev.map((t) => ({ ...t, done: !!doneMap[t.id] })));
      } catch (e) {
        console.error("[Week3] load done error:", e);
      }
    })();
  }, [uid, tasks.length]);

  /* ----------------------------------
     AUTO CREATE SECTION + EMAIL TRAINER
  ---------------------------------- */
  useEffect(() => {
    if (!uid) return;
    const allDone = tasks.length > 0 && tasks.every((t) => t.done);
    if (!allDone) return;

    // Write section completion (unchanged)
    setDoc(
      doc(db, "users", uid, "sections", "week3"),
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
            subject: `${traineeName} completed Week 3`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0b3d91;padding:20px 24px;">
                  <h2 style="color:#FFC20E;margin:0;">Mr Lube Training</h2>
                </div>
                <div style="padding:24px;border:1px solid #e0e0e0;border-top:none;">
                  <p>Hi,</p>
                  <p>Your trainee <strong>${traineeName}</strong> has completed
                     <strong>Week 3</strong> on <strong>${completedDate}</strong>.</p>
                  <p style="color:#555;font-size:14px;">
                    Please log in to the Mr Lube Training portal to review their progress
                    and approve Week 3 when ready.
                  </p>
                </div>
              </div>
            `,
          },
        });
      } catch (e) {
        console.warn("[week3 notify] email failed:", e);
      }
    })();
  }, [uid, tasks]);

  /* ----------------------------------
     TOGGLE DONE
  ---------------------------------- */
  async function toggleTask(id: string, next: boolean) {
    if (!uid) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: next } : t)));
    try {
      const storeId = await getStoreId();
      const task = tasks.find((t) => t.id === id);
      const key = `modules__week3__tasks__${id}`;
      await setDoc(
        doc(db, "users", uid, "progress", key),
        {
          storeId: storeId || "",
          traineeId: uid,
          createdBy: uid,
          week: "week3",
          title: task?.title ?? id,
          done: next,
          completedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !next } : t)));
    }
  }

  /* ----------------------------------
     DERIVED
  ---------------------------------- */
  const locked = week2Approved === false;
  const doneCount = useMemo(() => tasks.filter((t) => t.done).length, [tasks]);
  const pct = useMemo(
    () => (tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0),
    [doneCount, tasks.length]
  );

  if (authLoading || loading || week2Approved === null) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ----------------------------------
     UI
  ---------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 16 }}>
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
            textDecoration: "none",
            color: NAVY,
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>

      {locked && (
        <div
          style={{
            background: "#f1f3f4",
            border: "1px solid #dadce0",
            padding: "12px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 600,
            color: "#5f6368",
          }}
        >
          Complete and get Week 2 approved to unlock Week 3.
        </div>
      )}

      <h2 style={{ marginBottom: 6, opacity: locked ? 0.6 : 1 }}>
        Week 3 — Tasks
      </h2>

      <div style={{ fontSize: 14, marginBottom: 6, opacity: locked ? 0.6 : 1 }}>
        {doneCount}/{tasks.length} completed ({pct}%)
      </div>

      <div
        style={{
          height: 12,
          background: "#d9d9df",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 18,
          opacity: locked ? 0.5 : 1,
        }}
      >
        <div style={{ height: "100%", width: `${pct}%`, background: YELLOW }} />
      </div>

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          display: "grid",
          gap: 10,
          opacity: locked ? 0.6 : 1,
          pointerEvents: locked ? "none" : "auto",
        }}
      >
        {tasks.map((t, index) => {
          const order = t.order ?? t.sort_order ?? index + 1;
          const done = !!t.done;
          const approved = !!approvedById[t.id];

          return (
            <li
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                borderRadius: 12,
                background: "#fff",
                border: `1px solid ${done ? "#d6ead8" : GRAY}`,
                position: "relative",
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
                  cursor: "pointer",
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

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600 }}>
                  {order}. {t.title ?? t.id}
                </div>
                {approved && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#e7f6ec",
                      border: "1px solid #c7e8d3",
                      color: "#1b5e20",
                      fontWeight: 600,
                    }}
                  >
                    Approved ✓
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
