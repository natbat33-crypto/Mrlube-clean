"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, auth } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  serverTimestamp,
  collection,
  query,
  where,
  getCountFromServer,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/* ---------------- shared utils ---------------- */
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/* ---------------- calendar helpers ---------------- */
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const inRange = (d: Date, s: Date, e: Date) => d >= s && d <= e;

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const start = first.getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/* ---------------- types ---------------- */
type TraineeDoc = {
  startDate: Timestamp;
  durationDays: number;
  whmisCompletedDate?: Timestamp | null;
  whmisExpiryDate?: Timestamp | null;
  whmisProvider?: string;
};

/* ---------------- ensure trainee doc ---------------- */
async function ensureTraineeDoc(uid: string, defaultDays = 30) {
  const ref = doc(db, "trainees", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      { startDate: serverTimestamp(), durationDays: defaultDays },
      { merge: true }
    );
    return;
  }

  const data = snap.data() as Partial<TraineeDoc>;
  const updates: Record<string, any> = {};
  if (!data.startDate) updates.startDate = serverTimestamp();
  if (typeof data.durationDays !== "number")
    updates.durationDays = defaultDays;

  if (Object.keys(updates).length) await setDoc(ref, updates, { merge: true });
}

/* ---------------- WRAPPER: gets real UID from Firebase ---------------- */

const NAVY = "#0b3d91";
const GRAY = "#e9e9ee";

export default function ProgressPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (user) => {
      setUid(user ? user.uid : null);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">
        Loading your account…
      </div>
    );
  }

  if (!uid) {
    if (typeof window !== "undefined") {
      window.location.assign("/auth/login");
    }
    return null;
  }

  return <ProgressPageInner key={uid} uid={uid} />;
}

/* ---------------- MAIN PAGE (same layout as before) ---------------- */

function ProgressPageInner({ uid }: { uid: string }) {
  const today = startOfDay(new Date());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWhmis, setSavingWhmis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [durationDays, setDurationDays] = useState<number>(30);

  // Progress
  const [tasksDone, setTasksDone] = useState<number>(0);
  const [tasksTotal, setTasksTotal] = useState<number>(0);

  // WHMIS
  const [whmisCompletedDate, setWhmisCompletedDate] = useState<Date | null>(
    null
  );
  const [whmisExpiryDate, setWhmisExpiryDate] = useState<Date | null>(null);
  const [whmisProvider, setWhmisProvider] = useState<string>("");

  /* ---------------- derived ---------------- */
  const endDate = useMemo(
    () => (startDate ? addDays(startDate, durationDays - 1) : null),
    [startDate, durationDays]
  );

  const daysElapsed = useMemo(() => {
    if (!startDate) return 0;
    const ms =
      startOfDay(new Date()).getTime() - startOfDay(startDate).getTime();
    return clamp(Math.floor(ms / 86400000) + 1, 0, durationDays);
  }, [startDate, durationDays]);

  const daysRemaining = useMemo(
    () => (startDate ? clamp(durationDays - daysElapsed, 0, durationDays) : 0),
    [startDate, durationDays, daysElapsed]
  );

  const timePct = useMemo(
    () =>
      startDate
        ? Math.round(((durationDays - daysRemaining) / durationDays) * 100)
        : 0,
    [startDate, durationDays, daysRemaining]
  );

  const tasksPct = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  /* ---------------- load data ---------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        await ensureTraineeDoc(uid, 30);

        const tRef = doc(db, "trainees", uid);
        const tSnap = await getDoc(tRef);

        if (tSnap.exists()) {
          const data = tSnap.data() as Partial<TraineeDoc>;

          if (data.startDate) setStartDate(data.startDate.toDate());
          if (typeof data.durationDays === "number")
            setDurationDays(data.durationDays);

          if (data.whmisCompletedDate instanceof Timestamp)
            setWhmisCompletedDate(data.whmisCompletedDate.toDate());

          if (data.whmisExpiryDate instanceof Timestamp)
            setWhmisExpiryDate(data.whmisExpiryDate.toDate());

          if (typeof data.whmisProvider === "string")
            setWhmisProvider(data.whmisProvider);
        }

        // Task totals (same as before)
        const cols = [
          collection(db, "days", "day-1", "tasks"),
          collection(db, "modules", "week1", "tasks"),
          collection(db, "modules", "week2", "tasks"),
          collection(db, "modules", "week3", "tasks"),
          collection(db, "modules", "week4", "tasks"),
        ];

        let total = 0;
        let done = 0;

        for (const col of cols) {
          const totalSnap = await getCountFromServer(col);
          const doneSnap = await getCountFromServer(
            query(col, where("done", "==", true))
          );

          total += totalSnap.data().count || 0;
          done += doneSnap.data().count || 0;
        }

        if (alive) {
          setTasksTotal(total);
          setTasksDone(done);
        }

        setError(null);
      } catch (e: any) {
        setError(e.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid]);

  /* ---------------- save start ---------------- */
  async function saveStart(dateStr: string, days: number) {
    try {
      setSaving(true);
      const d = new Date(dateStr + "T00:00:00");
      await setDoc(
        doc(db, "trainees", uid),
        {
          startDate: Timestamp.fromDate(d),
          durationDays: days,
        },
        { merge: true }
      );
      setStartDate(d);
      setDurationDays(days);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- save whmis ---------------- */
  async function saveWhmis(
    completedStr: string,
    expiryStr: string,
    provider: string
  ) {
    try {
      setSavingWhmis(true);

      const completed = completedStr
        ? new Date(completedStr + "T00:00:00")
        : null;
      const expiry = expiryStr ? new Date(expiryStr + "T00:00:00") : null;

      await setDoc(
        doc(db, "trainees", uid),
        {
          whmisCompletedDate: completed
            ? Timestamp.fromDate(completed)
            : null,
          whmisExpiryDate: expiry ? Timestamp.fromDate(expiry) : null,
          whmisProvider: provider || "",
        },
        { merge: true }
      );

      setWhmisCompletedDate(completed);
      setWhmisExpiryDate(expiry);
      setWhmisProvider(provider);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSavingWhmis(false);
    }
  }

  const whmisCompletedStr =
    whmisCompletedDate ? ymd(whmisCompletedDate) : "";
  const whmisExpiryStr = whmisExpiryDate ? ymd(whmisExpiryDate) : "";

  const showMonth = startDate ?? today;
  const matrix = monthMatrix(
    showMonth.getFullYear(),
    showMonth.getMonth()
  );

  /* ---------------- UI (unchanged layout) ---------------- */
  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl lg:text-3xl font-bold text-primary">
          Training Progress
        </h1>
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
            whiteSpace: "nowrap",
          }}
        >
          ← Back to Dashboard
        </Link>
      </div>

      {!loading && !startDate && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Set your training start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="text-sm flex-1">
                Start date
                <input
                  id="startDateInput"
                  type="date"
                  defaultValue={ymd(today)}
                  className="mt-1 w-full border rounded-md px-3 py-2"
                />
              </label>
              <label className="text-sm w-36">
                Duration (days)
                <input
                  id="durationInput"
                  type="number"
                  defaultValue={30}
                  className="mt-1 w-full border rounded-md px-3 py-2"
                />
              </label>
            </div>

            <button
              onClick={() => {
                const d = (
                  document.getElementById(
                    "startDateInput"
                  ) as HTMLInputElement
                ).value;
                const dur = (
                  document.getElementById(
                    "durationInput"
                  ) as HTMLInputElement
                ).value;
                saveStart(d || ymd(today), Number(dur || 30));
              }}
              disabled={saving}
              className="px-4 py-2 rounded-md bg-primary text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Start Training"}
            </button>
            {error && (
              <p className="text-xs text-red-600 mt-1">{error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {startDate && (
        <>
          <Card>
            <CardContent className="p-4 lg:p-6 space-y-4">
              <div className="flex flex-wrap gap-6 items-end">
                <div>
                  <div className="text-sm text-muted-foreground">Start</div>
                  <div className="font-semibold">
                    {startDate.toLocaleDateString()}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">Due</div>
                  <div className="font-semibold">
                    {endDate?.toLocaleDateString()}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground">
                    Days remaining
                  </div>
                  <div className="font-semibold">
                    {daysRemaining}/{durationDays}
                  </div>
                </div>

                <div className="ml-auto min-w-[220px]">
                  <div className="flex justify-between text-xs mb-1">
                    <span>Tasks Progress</span>
                    <span>{tasksPct}%</span>
                  </div>
                  <Progress
                    value={tasksPct}
                    className="h-2 [&>div]:bg-yellow-400"
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    {tasksDone}/{tasksTotal} tasks completed
                  </div>
                </div>
              </div>

              <div className="ml-auto min-w-[220px]">
                <div className="flex justify-between text-xs mb-1">
                  <span>Time Progress</span>
                  <span>{timePct}%</span>
                </div>
                <Progress
                  value={timePct}
                  className="h-2 [&>div]:bg-blue-500"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {showMonth.toLocaleString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (d) => (
                    <div key={d}>{d}</div>
                  )
                )}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {matrix.flat().map((d, i) => {
                  if (!d) return <div key={i} className="h-8" />;
                  const shaded =
                    startDate && endDate && inRange(d, startDate, endDate);
                  const isToday = sameDay(d, today);
                  const isDue = endDate && sameDay(d, endDate);

                  return (
                    <div
                      key={i}
                      className={[
                        "h-8 rounded-md border text-sm flex items-center justify-center",
                        shaded ? "bg-blue-100 border-blue-200" : "",
                        isToday ? "ring-1 ring-primary" : "",
                        isDue
                          ? "bg-yellow-100 border-yellow-300 font-semibold"
                          : "",
                      ].join(" ")}
                    >
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-base">WHMIS Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm flex flex-col">
                  Completed
                  <input
                    type="date"
                    value={whmisCompletedStr}
                    onChange={(e) =>
                      setWhmisCompletedDate(
                        e.target.value
                          ? new Date(e.target.value + "T00:00:00")
                          : null
                      )
                    }
                    className="mt-1 w-full border rounded-md px-3 py-2"
                  />
                </label>

                <label className="text-sm flex flex-col">
                  Expires
                  <input
                    type="date"
                    value={whmisExpiryStr}
                    onChange={(e) =>
                      setWhmisExpiryDate(
                        e.target.value
                          ? new Date(e.target.value + "T00:00:00")
                          : null
                      )
                    }
                    className="mt-1 w-full border rounded-md px-3 py-2"
                  />
                </label>

                <label className="text-sm flex flex-col">
                  Provider
                  <input
                    type="text"
                    placeholder="Online module"
                    value={whmisProvider}
                    onChange={(e) => setWhmisProvider(e.target.value)}
                    className="mt-1 w-full border rounded-md px-3 py-2"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Keep WHMIS up to date for compliance.
                </p>
                <button
                  onClick={() =>
                    saveWhmis(
                      whmisCompletedStr,
                      whmisExpiryStr,
                      whmisProvider
                    )
                  }
                  disabled={savingWhmis}
                  className="px-3 py-2 rounded-md bg-primary text-white text-sm disabled:opacity-60"
                >
                  {savingWhmis ? "Saving…" : "Save"}
                </button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
