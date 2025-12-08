"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db, auth } from "@/lib/firebase";

import {
  collection,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

const GREEN = "#2e7d32";
const GRAY = "#e9e9ee";
const YELLOW = "#FFC20E";

function num(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function SupervisorDay1Page() {
  const search = useSearchParams();
  const traineeId = search.get("as"); // which trainee to review

  const [reviewer, setReviewer] = useState<string | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [approved, setApproved] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  // Supervisor UID
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setReviewer(u?.uid ?? null);
    });
    return unsub;
  }, []);

  // Load trainee section approval
  useEffect(() => {
    if (!traineeId) return;

    const ref = doc(db, "users", traineeId, "sections", "day1");
    const unsub = onSnapshot(ref, (snap) => {
      setApproved(snap.data()?.approved === true);
    });

    return unsub;
  }, [traineeId]);

  // Load tasks + trainee progress
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!traineeId) return;

      // Load tasks
      const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
      const loadedTasks = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort(
          (a, b) =>
            num(a.order ?? a.sort_order ?? 0) -
            num(b.order ?? b.sort_order ?? 0)
        );

      // Load trainee progress docs
      const progRef = collection(db, "users", traineeId, "progress");
      const progSnap = await getDocs(progRef);

      const prog: Record<string, any> = {};
      progSnap.docs.forEach((d) => {
        const data = d.data() as any;
        if (data.path?.startsWith("days/day-1/tasks/")) {
          const taskId = data.path.split("/").pop();
          prog[taskId!] = data;
        }
      });

      if (!alive) return;

      setTasks(loadedTasks);
      setProgress(prog);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [traineeId]);

  // Approve / Unapprove one task
  async function toggleApprove(taskId: string, next: boolean) {
    if (!traineeId || !reviewer) return;

    const key = `days__day-1__tasks__${taskId}`;

    await setDoc(
      doc(db, "users", traineeId, "progress", key),
      {
        approved: next,
        approvedAt: next ? serverTimestamp() : null,
        approvedBy: reviewer,
      },
      { merge: true }
    );
  }

  // Approve entire Day-1 section
  async function approveSection() {
    if (!traineeId || !reviewer) return;

    await setDoc(
      doc(db, "users", traineeId, "sections", "day1"),
      {
        approved: true,
        approvedAt: serverTimestamp(),
        approvedBy: reviewer,
      },
      { merge: true }
    );
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <Link href={`/supervisor?as=${traineeId}`}>
        <div className="text-sm text-blue-600 mb-3 hover:underline">
          ← Back to Dashboard
        </div>
      </Link>

      <h1 className="text-xl font-bold">Day 1 — Review & Approval</h1>
      <p className="text-sm text-gray-600">
        Reviewing trainee: <strong>{traineeId}</strong>
      </p>

      {/* Section approval */}
      <div
        className="p-4 rounded border"
        style={{ background: approved ? "#e8f5e9" : "#fff3cd" }}
      >
        {approved ? (
          <p className="font-semibold text-green-700">
            Day 1 is fully approved ✓
          </p>
        ) : (
          <>
            <p className="font-semibold text-yellow-800 mb-2">
              Day 1 not yet approved
            </p>
            <button
              className="px-4 py-2 bg-green-600 text-white rounded"
              onClick={approveSection}
            >
              Approve Day 1
            </button>
          </>
        )}
      </div>

      {/* Tasks */}
      <div className="space-y-3">
        {tasks.map((t) => {
          const p = progress[t.id] || {};
          const done = p.done === true;
          const isApproved = p.approved === true;

          return (
            <div
              key={t.id}
              className="p-4 rounded border bg-white flex justify-between items-center"
              style={{
                borderColor: done ? "#d6ead8" : GRAY,
              }}
            >
              <div>
                <div className="font-semibold">
                  {num(t.order ?? t.sort_order)}. {t.title ?? t.id}
                </div>
                <div className="text-xs text-gray-600">
                  {done ? "Completed" : "Not completed"}
                </div>
              </div>

              {done && (
                <button
                  className={`px-3 py-1 rounded text-sm ${
                    isApproved
                      ? "bg-green-600 text-white"
                      : "bg-gray-200 text-black"
                  }`}
                  onClick={() => toggleApprove(t.id, !isApproved)}
                >
                  {isApproved ? "Approved ✓" : "Approve"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
