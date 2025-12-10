"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/* ---------------- Types ---------------- */
type FirestoreTimestamp = { seconds: number; nanoseconds: number };

type Role =
  | "trainee"
  | "trainer"
  | "supervisor"
  | "assistant-manager"
  | "manager"
  | "admin"
  | string;

type ManagerUser = {
  uid: string;
  role?: Role;
  storeId?: string | number;
};

type TraineeUser = {
  uid: string;
  name?: string;
  email?: string;
  role?: Role;
  storeId?: string | number;
  startDate?: FirestoreTimestamp | Date | string;
  whmisCompletedDate?: FirestoreTimestamp | Date | string;
  whmisExpiryDate?: FirestoreTimestamp | Date | string;
};

type RawTask = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
  required?: boolean;
};

type TaskWithState = RawTask & {
  completed: boolean;
  timer?: {
    lastMs?: number;
    bestMs?: number;
    avgMs?: number;
    count?: number;
  };
};

type SectionKey = "day1" | "week1" | "week2" | "week3" | "week4";

type SectionState = {
  title: string;
  key: SectionKey;
  tasks: TaskWithState[];
  approved: boolean;
  approvedAt?: Date | null;
  approvedBy?: string | null;
};

type SectionsByKey = Record<SectionKey, SectionState>;

/* ---------------- Helpers ---------------- */

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function firestoreTsToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  return null;
}

function formatDate(value: any): string {
  const d = firestoreTsToDate(value);
  if (!d) return "—";
  return d.toLocaleDateString();
}

function msToClock(ms?: number): string {
  if (!ms && ms !== 0) return "—";
  const total = Math.round(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ---------- Load all task templates ---------- */
async function loadAllTasks() {
  async function loadOrdered(pathArr: string[]): Promise<RawTask[]> {
    const qRef = query(
      collection(db, pathArr[0], pathArr[1], pathArr[2]),
      orderBy("order", "asc")
    );
    const snap = await getDocs(qRef);
    return snap.docs
      .map((d) => {
        const data = d.data();
        const { done, ...rest } = data;
        return { id: d.id, ...(rest as Partial<RawTask>) };
      })
      .sort((a, b) => num(a.order ?? a.sort_order) - num(b.order ?? b.sort_order));
  }

  const [day1, week1, week2, week3, week4] = await Promise.all([
    loadOrdered(["days", "day-1", "tasks"]),
    loadOrdered(["modules", "week1", "tasks"]),
    loadOrdered(["modules", "week2", "tasks"]),
    loadOrdered(["modules", "week3", "tasks"]),
    loadOrdered(["modules", "week4", "tasks"]),
  ]);

  return { day1, week1, week2, week3, week4 };
}

/* ===========================================================
   EMPLOYEE DETAIL PAGE
=========================================================== */

export default function EmployeeDetailPage({ params }: { params: { uid: string } }) {
  const traineeUid = params.uid;

  const [authUser, setAuthUser] = useState<ManagerUser | null>(null);
  const [trainee, setTrainee] = useState<TraineeUser | null>(null);
  const [sections, setSections] = useState<SectionsByKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [approveBusy, setApproveBusy] = useState<SectionKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  /* ---------- Auth ---------- */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return setAuthUser(null);
      const snap = await getDoc(doc(db, "users", u.uid));
      const data = snap.data() || {};
      setAuthUser({ uid: u.uid, role: data.role || "manager", storeId: data.storeId });
    });
    return () => unsub();
  }, []);

  /* ---------- Load trainee + tasks + progress ---------- */
  useEffect(() => {
    if (!traineeUid) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const tSnap = await getDoc(doc(db, "users", traineeUid));
        if (!tSnap.exists()) throw new Error("Trainee not found.");

        const td = tSnap.data() as any;
        const traineeInfo: TraineeUser = {
          uid: traineeUid,
          name: td.name || td.displayName || "",
          email: td.email || "",
          role: td.role || "trainee",
          storeId: td.storeId,
          startDate: td.startDate,
          whmisCompletedDate: td.whmisCompletedDate,
          whmisExpiryDate: td.whmisExpiryDate,
        };

        const templates = await loadAllTasks();

        const progSnap = await getDocs(collection(db, "users", traineeUid, "progress"));
        const completedIds: string[] = [];
        const timers: Record<string, any> = {};

        progSnap.forEach((d) => {
          const id = d.id;
          const v = d.data() || {};

          const isDone =
            v.done || v.completed || v.status === "done" || v.approved || v.completedAt;

          if (isDone) completedIds.push(id);

          if (id.startsWith("modules__week4__tasks__")) {
            const tid = id.split("__").pop()!;
            timers[tid] = {
              lastMs: v.lastMs,
              bestMs: v.bestMs,
              avgMs: v.avgMs,
              count: v.count,
            };
          }
        });

        const secSnap = await getDocs(collection(db, "users", traineeUid, "sections"));
        const approval: any = {};
        secSnap.forEach((d) => {
          approval[d.id] = {
            approved: !!d.data()?.approved,
            approvedAt: firestoreTsToDate(d.data()?.approvedAt),
            approvedBy: d.data()?.approvedBy || null,
          };
        });

        function mapTasks(list: RawTask[], prefix: string, timerMap?: any) {
          return list.map((t, idx) => {
            const full = `${prefix}__${t.id}`;
            return {
              ...t,
              order: t.order ?? t.sort_order ?? idx + 1,
              completed: completedIds.includes(full),
              timer: timerMap?.[t.id],
            };
          });
        }

        const merged: SectionsByKey = {
          day1: {
            key: "day1",
            title: "Day 1 — Orientation & Basics",
            tasks: mapTasks(templates.day1, "days__day-1__tasks"),
            approved: approval.day1?.approved ?? false,
            approvedAt: approval.day1?.approvedAt ?? null,
            approvedBy: approval.day1?.approvedBy ?? null,
          },
          week1: {
            key: "week1",
            title: "Week 1 — Core Services",
            tasks: mapTasks(templates.week1, "modules__week1__tasks"),
            approved: approval.week1?.approved ?? false,
            approvedAt: approval.week1?.approvedAt ?? null,
            approvedBy: approval.week1?.approvedBy ?? null,
          },
          week2: {
            key: "week2",
            title: "Week 2 — Intermediate Skills",
            tasks: mapTasks(templates.week2, "modules__week2__tasks"),
            approved: approval.week2?.approved ?? false,
            approvedAt: approval.week2?.approvedAt ?? null,
            approvedBy: approval.week2?.approvedBy ?? null,
          },
          week3: {
            key: "week3",
            title: "Week 3 — Advanced Skills",
            tasks: mapTasks(templates.week3, "modules__week3__tasks"),
            approved: approval.week3?.approved ?? false,
            approvedAt: approval.week3?.approvedAt ?? null,
            approvedBy: approval.week3?.approvedBy ?? null,
          },
          week4: {
            key: "week4",
            title: "Week 4 — Timed Tasks",
            tasks: mapTasks(templates.week4, "modules__week4__tasks", timers),
            approved: approval.week4?.approved ?? false,
            approvedAt: approval.week4?.approvedAt ?? null,
            approvedBy: approval.week4?.approvedBy ?? null,
          },
        };

        if (!alive) return;

        setTrainee(traineeInfo);
        setSections(merged);
      } catch (e: any) {
        console.error(e);
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [traineeUid]);

  /* ---------- Training Day Calculation ---------- */
  const startInfo = useMemo(() => {
    if (!trainee?.startDate) return { hasStart: false };

    const d = firestoreTsToDate(trainee.startDate);
    if (!d) return { hasStart: false };

    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const remaining = 30 - diff;

    return {
      hasStart: true,
      startDateStr: d.toLocaleDateString(),
      daysIn: diff,
      isOverdue: remaining < 0,
      label: remaining < 0 ? `Overdue by ${Math.abs(remaining)} days` : `${remaining} days remaining`,
    };
  }, [trainee]);

  const canApprove =
    authUser &&
    ["trainer", "supervisor", "assistant-manager", "admin"].includes(
      (authUser.role || "").toString().toLowerCase()
    );

  async function handleApprove(sectionKey: SectionKey) {
    if (!canApprove) return;
    try {
      setApproveBusy(sectionKey);
      const role = authUser?.role || "manager";
      await setDoc(
        doc(db, "users", traineeUid, "sections", sectionKey),
        {
          approved: true,
          approvedAt: serverTimestamp(),
          approvedBy: role,
        },
        { merge: true }
      );
      setSections((prev) =>
        prev
          ? {
              ...prev,
              [sectionKey]: {
                ...prev[sectionKey],
                approved: true,
                approvedAt: new Date(),
                approvedBy: role,
              },
            }
          : prev
      );
    } finally {
      setApproveBusy(null);
    }
  }

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">Loading trainee…</main>
    );
  }

  if (error || !trainee || !sections) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <Link
          href="/manager"
          className="inline-block text-sm px-3 py-1 rounded-full bg-gray-100"
        >
          ← Back
        </Link>
        <div className="text-red-600">{error || "Unable to load trainee"}</div>
      </main>
    );
  }

  const whmisCompleted = !!trainee.whmisCompletedDate;
  const whmisExpired =
    trainee.whmisExpiryDate &&
    firestoreTsToDate(trainee.whmisExpiryDate)?.getTime()! < Date.now();

  const sectionOrder: SectionKey[] = ["day1", "week1", "week2", "week3", "week4"];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Back */}
      <div>
        <Link
          href="/manager"
          className="inline-flex items-center gap-2 text-sm px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200"
        >
          ← Back to Manager Dashboard
        </Link>
      </div>

      {/* Trainee Card */}
      <section className="rounded-2xl border bg-white p-5 space-y-3">
        <div className="text-xs uppercase text-gray-500">Trainee</div>

        {trainee.email && (
          <div className="text-[13px] text-gray-700 break-all leading-tight">
            {trainee.email}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-[11px] text-gray-700">
          {trainee.role && (
            <span className="px-2 py-1 rounded-full bg-gray-100 whitespace-nowrap">
              Role: {String(trainee.role).replace("-", " ")}
            </span>
          )}
          {trainee.storeId && (
            <span className="px-2 py-1 rounded-full bg-gray-100 whitespace-nowrap">
              Store: {trainee.storeId}
            </span>
          )}
        </div>

        {/* Start / Training Window */}
        {startInfo.hasStart && (
          <div className="p-3 rounded-xl bg-gray-50 border text-xs space-y-1">
            <div className="flex flex-wrap justify-between text-[11px]">
              <span className="font-medium">Start date:</span>{" "}
              {startInfo.startDateStr}
            </div>

            <div className="text-[11px]">Days in training: {startInfo.daysIn}</div>

            <div
              className={
                startInfo.isOverdue
                  ? "text-red-700 font-semibold text-[11px]"
                  : "text-gray-800 font-medium text-[11px]"
              }
            >
              {startInfo.label}
            </div>
          </div>
        )}
      </section>

      {/* Certificates */}
      <section className="rounded-2xl border bg-white p-5 space-y-3">
        <div className="text-sm font-semibold">Certificates</div>

        <div className="text-xs">
          <span className="font-medium">WHMIS Status:</span>{" "}
          <span
            className={
              whmisCompleted && !whmisExpired
                ? "text-green-700 font-semibold"
                : whmisCompleted && whmisExpired
                ? "text-red-700 font-semibold"
                : "text-gray-700 font-semibold"
            }
          >
            {whmisCompleted
              ? whmisExpired
                ? "Completed (Expired)"
                : "Completed"
              : "Not Completed"}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-2 text-[11px] text-gray-700">
          <div>
            <span className="font-medium">Completed:</span>{" "}
            {formatDate(trainee.whmisCompletedDate)}
          </div>
          <div>
            <span className="font-medium">Expiry:</span>{" "}
            {formatDate(trainee.whmisExpiryDate)}
          </div>
        </div>
      </section>

      {/* Sections */}
      {sectionOrder.map((key) => {
        const sec = sections[key];
        const total = sec.tasks.length;
        const done = sec.tasks.filter((t) => t.completed).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const pending = done === total && !sec.approved;

        const isOpen = openSections[key];

        return (
          <section key={key} className="rounded-2xl border bg-white p-5 space-y-4">
            {/* Header */}
            <div
              className="flex justify-between items-start cursor-pointer"
              onClick={() =>
                setOpenSections((p) => ({ ...p, [key]: !p[key] }))
              }
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold break-words">{sec.title}</div>
                <div className="text-[11px] text-gray-600">
                  {done}/{total} ({pct}%)
                </div>
              </div>

              <div className="flex flex-col items-end text-[10px] min-w-[90px]">
                <div
                  className={
                    sec.approved
                      ? "px-2 py-1 rounded-full bg-green-100 text-green-800 whitespace-nowrap"
                      : pending
                      ? "px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 whitespace-nowrap"
                      : "px-2 py-1 rounded-full bg-gray-100 text-gray-700 whitespace-nowrap"
                  }
                >
                  {sec.approved
                    ? "Approved"
                    : pending
                    ? "Pending"
                    : "In Progress"}
                </div>

                {sec.approvedAt && (
                  <div className="text-[10px] text-gray-500 whitespace-nowrap">
                    {sec.approvedAt.toLocaleDateString()}
                    {sec.approvedBy ? ` by ${sec.approvedBy}` : ""}
                  </div>
                )}

                {canApprove && !sec.approved && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApprove(sec.key);
                    }}
                    disabled={approveBusy === sec.key}
                    className="mt-1 px-2 py-1 rounded-full border text-[10px] hover:bg-gray-50 disabled:opacity-60 whitespace-nowrap"
                  >
                    {approveBusy === sec.key ? "Approving…" : "Approve"}
                  </button>
                )}
              </div>
            </div>

            {/* Collapsible tasks */}
            {isOpen && (
              <div className="space-y-2">
                {sec.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col sm:flex-row justify-between gap-2 rounded-xl border px-3 py-2 text-[13px]"
                  >
                    <div className="flex gap-2 min-w-0">
                      <div
                        className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center ${
                          t.completed
                            ? "bg-green-600 border-green-600"
                            : "border-gray-400"
                        }`}
                      >
                        {t.completed && (
                          <svg
                            viewBox="0 0 24 24"
                            width="10"
                            height="10"
                            stroke="#fff"
                            strokeWidth="3"
                            fill="none"
                          >
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-medium break-words">
                          {t.order}. {t.title || t.id}
                        </div>
                        {t.required && (
                          <div className="text-[10px] text-gray-500">Required</div>
                        )}
                      </div>
                    </div>

                    {/* Week 4 timers */}
                    {key === "week4" && t.timer && (
                      <div className="text-[10px] text-gray-600 sm:text-right whitespace-nowrap">
                        Last: {msToClock(t.timer.lastMs)}{" "}
                        {t.timer.bestMs && `• Best: ${msToClock(t.timer.bestMs)} `}
                        {t.timer.avgMs && `• Avg: ${msToClock(t.timer.avgMs)} `}
                        {typeof t.timer.count === "number" &&
                          `• Sessions ${t.timer.count}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

