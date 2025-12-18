"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { db, auth } from "@/lib/firebase";
import { useStoreCtx } from "@/app/providers/StoreProvider";
import { useSupervisorTrainees } from "@/lib/useSupervisorTrainees";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

/* ----------------------------------
   TYPES & CONSTANTS
---------------------------------- */
type Task = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
};

type Progress = {
  done: boolean;
  approved: boolean;
};

type ProgressById = Record<string, Progress>;

const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ----------------------------------
   MAIN COMPONENT
---------------------------------- */
export default function Day1SupervisorPage() {
  const [supervisorUid, setSupervisorUid] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [progressById, setProgressById] = useState<ProgressById>({});
  const [sectionApproved, setSectionApproved] = useState(false);

  const [loadingTasks, setLoadingTasks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { storeId: ctxStoreId } = useStoreCtx();
  const searchParams = useSearchParams();
  const asParam = searchParams.get("as");

  const [storeId, setStoreId] = useState<string | null>(ctxStoreId ?? null);
  const trainees = useSupervisorTrainees(storeId);

  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(
    asParam
  );

  /* ----------------------------------
     1. AUTH LISTENER
  ---------------------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setSupervisorUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* ----------------------------------
     2. SYNC STORE
  ---------------------------------- */
  useEffect(() => {
    if (ctxStoreId) setStoreId(ctxStoreId);
  }, [ctxStoreId]);

  /* ----------------------------------
     3. SELECT TRAINEE
  ---------------------------------- */
  useEffect(() => {
    if (asParam) {
      setSelectedTraineeId(asParam);
      return;
    }
    if (!selectedTraineeId && trainees.length > 0) {
      setSelectedTraineeId(trainees[0].traineeId);
    }
  }, [asParam, trainees, selectedTraineeId]);

  /* ----------------------------------
     4. LOAD TASK DEFINITIONS
  ---------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingTasks(true);
        const snap = await getDocs(collection(db, "days", "day-1", "tasks"));

        const list: Task[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Partial<Task>) }))
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order) -
              num(b.order ?? b.sort_order)
          );

        if (!alive) return;
        setTasks(list);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? String(e));
        setTasks([]);
      } finally {
        if (alive) setLoadingTasks(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ----------------------------------
     5. LISTEN TO TRAINEE TASK PROGRESS
  ---------------------------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const q = query(
      collection(db, "users", selectedTraineeId, "progress"),
      where("week", "==", "day-1")
    );

    const unsub = onSnapshot(q, (snap) => {
      const map: ProgressById = {};
      snap.forEach((d) => {
        const parts = d.id.split("__");
        const taskId = parts[parts.length - 1];
        const data = d.data() as any;

        map[taskId] = {
          done: !!data.done,
          approved: !!data.approved,
        };
      });
      setProgressById(map);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* ----------------------------------
     6. LIVE SECTION AUTHORITY
  ---------------------------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const ref = doc(db, "users", selectedTraineeId, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setSectionApproved(snap.exists() && snap.data()?.approved === true);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* ----------------------------------
     7. ⭐ AUTHORITATIVE SECTION APPROVAL
        (SAFE + RACE-FREE)
  ---------------------------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;
    if (tasks.length === 0) return;

    // ensure progress loaded for ALL tasks
    const ready = tasks.every((t) => progressById[t.id] !== undefined);
    if (!ready) return;

    const allApproved = tasks.every(
      (t) => progressById[t.id]?.approved === true
    );

    setDoc(
      doc(db, "users", selectedTraineeId, "sections", "day1"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
    ).catch(console.error);
  }, [selectedTraineeId, tasks, progressById]);

  /* ----------------------------------
     8. TOGGLE TASK APPROVAL
  ---------------------------------- */
  async function toggleApproved(taskId: string, next: boolean) {
    if (!selectedTraineeId) return;

    const key = `days__day-1__tasks__${taskId}`;

    await setDoc(
      doc(db, "users", selectedTraineeId, "progress", key),
      {
        approved: next,
        approvedAt: next ? serverTimestamp() : deleteField(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /* ----------------------------------
     DERIVED
  ---------------------------------- */
  const doneCount = tasks.filter(
    (t) => progressById[t.id]?.done
  ).length;

  const approvedCount = tasks.filter(
    (t) => progressById[t.id]?.approved
  ).length;

  const pct = tasks.length
    ? Math.round((doneCount / tasks.length) * 100)
    : 0;

  if (authLoading || loadingTasks) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* ----------------------------------
     UI
  ---------------------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <Link
        href="/supervisor"
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
          marginBottom: 16,
        }}
      >
        ← Back to Trainer Dashboard
      </Link>

      <h2>Day 1 — Orientation Review</h2>
      <div style={{ fontSize: 14, marginBottom: 6 }}>
        {doneCount}/{tasks.length} completed · {approvedCount}/{tasks.length} approved
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
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: YELLOW,
          }}
        />
      </div>

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
        {tasks.map((t, idx) => {
          const prog = progressById[t.id] || { done: false, approved: false };
          const order = num(t.order ?? t.sort_order ?? idx + 1);

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
                border: `1px solid ${prog.done ? "#d6ead8" : GRAY}`,
              }}
            >
              <button
                disabled={!prog.done}
                onClick={() => toggleApproved(t.id, !prog.approved)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `2px solid ${
                    prog.approved ? GREEN : prog.done ? "#9aa0a6" : "#ccc"
                  }`,
                  background: prog.approved ? GREEN : "#fff",
                  cursor: prog.done ? "pointer" : "not-allowed",
                }}
              />

              <strong>
                {order}. {t.title ?? t.id}
              </strong>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

