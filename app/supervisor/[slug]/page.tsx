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

/* COLORS */
const YELLOW = "#FFC20E";
const NAVY = "#0b3d91";
const GREEN = "#2e7d32"; // ✔ correct Week-1 dark green
const GRAY = "#e9e9ee";

/* TYPES */
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

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function Day1SupervisorPage() {
  /* -----------------------
     STATE
  ----------------------- */
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

  /* -----------------------
     AUTH
  ----------------------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setSupervisorUid(u?.uid ?? null);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  /* -----------------------
     SYNC storeId
  ----------------------- */
  useEffect(() => {
    if (ctxStoreId) setStoreId(ctxStoreId);
  }, [ctxStoreId]);

  /* -----------------------
     SELECTED TRAINEE DEFAULT
  ----------------------- */
  useEffect(() => {
    if (asParam) {
      setSelectedTraineeId(asParam);
      return;
    }
    if (!selectedTraineeId && trainees.length > 0) {
      setSelectedTraineeId(trainees[0].traineeId);
    }
  }, [asParam, trainees, selectedTraineeId]);

  /* -----------------------
     LOAD DAY-1 TASKS
  ----------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoadingTasks(true);

        const col = collection(db, "days", "day-1", "tasks");
        const snap = await getDocs(col);

        const list: Task[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Partial<Task>) }))
          .sort(
            (a, b) =>
              num(a.order ?? a.sort_order ?? 0) -
              num(b.order ?? b.sort_order ?? 0)
          );

        if (!alive) return;
        setTasks(list);
        setError(null);
      } catch (e: any) {
        if (!alive) return;
        console.error("[Day1 supervisor] load tasks error:", e);
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

  /* -----------------------
     LISTEN FOR PROGRESS
  ----------------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const col = collection(db, "users", selectedTraineeId, "progress");
    const q = query(col, where("week", "==", "day-1"));

    const unsub = onSnapshot(q, (snap) => {
      const map: ProgressById = {};

      snap.forEach((d) => {
        const data = d.data() as any;
        const parts = d.id.split("__");
        const taskId = parts[parts.length - 1];

        map[taskId] = {
          done: !!data.done,
          approved: !!data.approved,
        };
      });

      setProgressById(map);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* -----------------------
     LISTEN FOR SECTION APPROVAL
  ----------------------- */
  useEffect(() => {
    if (!selectedTraineeId) return;

    const ref = doc(db, "users", selectedTraineeId, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setSectionApproved(snap.data()?.approved === true);
    });

    return unsub;
  }, [selectedTraineeId]);

  /* -----------------------
     AUTO WRITE SECTION APPROVAL
  ----------------------- */
  useEffect(() => {
    if (!selectedTraineeId || tasks.length === 0) return;

    const allApproved =
      tasks.length > 0 &&
      tasks.every((t) => progressById[t.id]?.approved === true);

    setDoc(
      doc(db, "users", selectedTraineeId, "sections", "day1"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
    ).catch((e) =>
      console.error("[Day1 supervisor] section approval write error:", e)
    );
  }, [selectedTraineeId, tasks, progressById]);

  /* -----------------------
     APPROVE BUTTON TOGGLE
  ----------------------- */
  async function toggleApproved(taskId: string, next: boolean) {
    if (!selectedTraineeId) {
      alert("Select a trainee first.");
      return;
    }

    try {
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
    } catch (e) {
      console.error("[Day1 supervisor] toggle approved error:", e);
      alert("Failed to save approval. Try again.");
    }
  }

  /* -----------------------
     DERIVED COUNTS
  ----------------------- */
  const doneCount = useMemo(
    () =>
      tasks.filter((t) => progressById[t.id]?.done === true).length,
    [tasks, progressById]
  );

  const approvedCount = useMemo(
    () =>
      tasks.filter((t) => progressById[t.id]?.approved === true).length,
    [tasks, progressById]
  );

  const pct = useMemo(
    () =>
      tasks.length ? Math.round((approvedCount / tasks.length) * 100) : 0,
    [approvedCount, tasks.length]
  );

  /* -----------------------
     LOADING
  ----------------------- */
  if (authLoading || loadingTasks) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }

  /* -----------------------
     UI (MATCHES WEEK 1)
  ----------------------- */
  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* Back */}
      <div style={{ marginBottom: 16 }}>
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
          }}
        >
          ← Back to Trainer Dashboard
        </Link>
      </div>

      {/* Trainee selector */}
      {storeId && trainees.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              marginBottom: 6,
              color: "#555",
            }}
          >
            Reviewing trainee:
          </label>

          <select
            value={selectedTraineeId ?? ""}
            onChange={(e) => setSelectedTraineeId(e.target.value || null)}
            style={{
              minWidth: 260,
              padding: "6px 10px",
              borderRadius: 8,
              border: `1px solid ${GRAY}`,
            }}
          >
            <option value="" disabled>
              Select trainee…
            </option>

            {trainees.map((t) => (
              <option key={t.id} value={t.traineeId}>
                {t.email || t.traineeEmail || t.userEmail || t.traineeId}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* HEADER */}
      <h2 style={{ marginBottom: 4 }}>Day 1 — Orientation Review</h2>

      <div style={{ fontSize: 14, marginBottom: 10 }}>
        {approvedCount}/{tasks.length} approved ({pct}%)
      </div>

      {/* WEEK 1 STYLE PROGRESS BAR */}
      <div
        style={{
          width: "120px",
          height: "8px",
          background: "#ddd",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: YELLOW,
            transition: "width 200ms",
          }}
        />
      </div>

      {error && <p style={{ color: "crimson" }}>Error: {error}</p>}

      {!selectedTraineeId && (
        <p style={{ fontSize: 14, color: "#666" }}>
          Select a trainee to review their Day 1 progress.
        </p>
      )}

      {/* TASK LIST — EXACT WEEK 1 UI */}
      {selectedTraineeId && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 12,
          }}
        >
          {tasks.map((t, idx) => {
            const order = num(t.order ?? t.sort_order ?? idx + 1);
            const prog = progressById[t.id] || {
              done: false,
              approved: false,
            };
            const approved = prog.approved;

            return (
              <li
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "#fff",
                  borderRadius: 12,
                  border: `1px solid ${GRAY}`,
                }}
              >
                {/* TEXT LEFT */}
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {order}. {t.title ?? t.id}
                </div>

                {/* BUTTON RIGHT (MATCH WEEK 1) */}
                <button
                  onClick={() => toggleApproved(t.id, !approved)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    border: `1px solid ${approved ? GREEN : "#d1d5db"}`,
                    background: approved ? GREEN : "#fff",
                    color: approved ? "#fff" : "#333",
                    cursor: "pointer",
                  }}
                >
                  {approved ? "Unapprove" : "Approve"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
