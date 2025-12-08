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
  serverTimestamp,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

const GRAY = "#e9e9ee";

function num(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ---------------------------------------------------
   NEW: Resolve store + confirm trainee assignment
---------------------------------------------------- */
async function resolveStoreId(): Promise<string> {
  const user = auth.currentUser;

  // Try ID token claims
  if (user) {
    const tok = await user.getIdTokenResult(true);
    if (tok?.claims?.storeId) return String(tok.claims.storeId);
  }

  // Try localStorage fallback
  if (typeof window !== "undefined") {
    const ls = localStorage.getItem("storeId");
    if (ls) return ls;
  }

  // Fallback search
  if (user) {
    const peek = ["24", "26", "262", "276", "298", "46", "79", "163"];
    for (const sid of peek) {
      const snap = await getDoc(doc(db, "stores", sid, "employees", user.uid));
      if (snap.exists()) return sid;
    }
  }

  return "";
}

export default function SupervisorDay1Page() {
  const search = useSearchParams();
  const traineeId = search.get("as");

  const [reviewer, setReviewer] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [validAssignment, setValidAssignment] = useState<boolean | null>(null);

  const [tasks, setTasks] = useState<any[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [approved, setApproved] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  /* ----------------------------------------------
     Supervisor UID
  ---------------------------------------------- */
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setReviewer(u?.uid ?? null);
    });
  }, []);

  /* ----------------------------------------------
     NEW: Validate store + trainee assignment
  ---------------------------------------------- */
  useEffect(() => {
    (async () => {
      if (!traineeId) return;

      const sid = await resolveStoreId();
      setStoreId(sid);

      if (!sid) {
        setValidAssignment(false);
        return;
      }

      const supUid = auth.currentUser?.uid;
      if (!supUid) {
        setValidAssignment(false);
        return;
      }

      // Check if trainee is assigned to this supervisor
      const tSnap = await getDoc(doc(db, "stores", sid, "trainees", traineeId));

      if (!tSnap.exists()) {
        setValidAssignment(false);
        return;
      }

      const data = tSnap.data() as any;

      if (data.supervisorId !== supUid || data.active !== true) {
        setValidAssignment(false);
        return;
      }

      setValidAssignment(true);
    })();
  }, [traineeId]);

  /* ----------------------------------------------
     Load Day-1 approval state
  ---------------------------------------------- */
  useEffect(() => {
    if (!traineeId) return;

    const ref = doc(db, "users", traineeId, "sections", "day1");
    return onSnapshot(ref, (snap) => {
      setApproved(snap.data()?.approved === true);
    });
  }, [traineeId]);

  /* ----------------------------------------------
     Load tasks + trainee progress
  ---------------------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!traineeId || validAssignment !== true) return;

      // Load tasks
      const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
      const loadedTasks = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .sort(
          (a, b) =>
            num(a.order ?? a.sort_order ?? 0) -
            num(b.order ?? b.sort_order ?? 0)
        );

      // Load progress entries for this trainee
      const progSnap = await getDocs(
        collection(db, "users", traineeId, "progress")
      );

      const prog: Record<string, any> = {};
      progSnap.forEach((d) => {
        const data = d.data() as any;
        if (data.path?.startsWith("days/day-1/tasks/")) {
          const tid = data.path.split("/").pop();
          prog[tid!] = data;
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
  }, [traineeId, validAssignment]);

  /* ----------------------------------------------
     Approve a single task
  ---------------------------------------------- */
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

  /* ----------------------------------------------
     Approve entire Day-1 section
  ---------------------------------------------- */
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

  /* ----------------------------------------------
     RENDER STATES
  ---------------------------------------------- */

  if (!traineeId) return <div className="p-6">Invalid trainee.</div>;

  if (validAssignment === false)
    return (
      <div className="p-6 text-red-600 font-semibold">
        You are not assigned to review this trainee.
      </div>
    );

  if (loading || validAssignment === null)
    return <div className="p-6">Loading…</div>;

  /* ----------------------------------------------
     MAIN UI
  ---------------------------------------------- */
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
