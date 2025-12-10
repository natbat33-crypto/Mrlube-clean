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
  getCountFromServer,
} from "firebase/firestore";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/* ---------------- utils ---------------- */
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

/* ---------------- trainee doc ---------------- */
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

  const data = snap.data() as any;
  const updates: any = {};

  if (!data.startDate) updates.startDate = serverTimestamp();
  if (typeof data.durationDays !== "number")
    updates.durationDays = defaultDays;

  if (Object.keys(updates).length) await setDoc(ref, updates, { merge: true });
}

/* ---------------- wrapper (real firebase uid) ---------------- */

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

/* ---------------- MAIN PAGE ---------------- */

const NAVY = "#0b3d91";
const GRAY = "#e9e9ee";

function ProgressPageInner({ uid }: { uid: string }) {
  const today = startOfDay(new Date());

  const [loading, setLoading] = useState(true);
  const [savingWhmis, setSavingWhmis] = useState(false);
  const [savingMsg, setSavingMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [storeId, setStoreId] = useState<string | null>(null);

  // progress
  const [tasksDone, setTasksDone] = useState<number>(0);
  const [tasksTotal, setTasksTotal] = useState<number>(46);

  // WHMIS
  const [whmisCompletedDate, setWhmisCompletedDate] = useState<Date | null>(null);
  const [whmisExpiryDate, setWhmisExpiryDate] = useState<Date | null>(null);
  const [whmisProvider, setWhmisProvider] = useState<string>("");

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

  const tasksPct = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  /* ---------------- load data ---------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        await ensureTraineeDoc(uid, 30);

        // load main user doc (storeId, WHMIS, startDate)
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data() as any;

          setStoreId(data.storeId || null);

          if (data.startDate instanceof Timestamp)
            setStartDate(data.startDate.toDate());

          if (typeof data.durationDays === "number")
            setDurationDays(data.durationDays);

          if (data.whmisCompletedDate instanceof Timestamp)
            setWhmisCompletedDate(data.whmisCompletedDate.toDate());

          if (data.whmisExpiryDate instanceof Timestamp)
            setWhmisExpiryDate(data.whmisExpiryDate.toDate());

          if (typeof data.whmisProvider === "string")
            setWhmisProvider(data.whmisProvider);
        }

        // task progress count
        try {
          const progressCol = collection(db, "users", uid, "progress");
          const doneSnap = await getCountFromServer(progressCol);
          setTasksDone(doneSnap.data().count || 0);
        } catch (err) {
          console.error("progress load failed:", err);
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

  /* ---------------- save WHMIS ---------------- */
  async function saveWhmis() {
    try {
      setSavingWhmis(true);
      setSavingMsg(null);

      const completed = whmisCompletedDate
        ? Timestamp.fromDate(whmisCompletedDate)
        : null;

      const expiry = whmisExpiryDate
        ? Timestamp.fromDate(whmisExpiryDate)
        : null;

      // 1️⃣ Save to main user doc
      await setDoc(
        doc(db, "users", uid),
        {
          whmisCompletedDate: completed,
          whmisExpiryDate: expiry,
          whmisProvider,
        },
        { merge: true }
      );

      // 2️⃣ Mirror to store trainee doc
      if (storeId) {
        await setDoc(
          doc(db, "stores", storeId, "trainees", uid),
          {
            whmisCompletedDate: completed,
            whmisExpiryDate: expiry,
            whmisProvider,
          },
          { merge: true }
        );
      }

      setSavingMsg("Saved!");
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSavingWhmis(false);
      setTimeout(() => setSavingMsg(null), 1500);
    }
  }

  const whmisCompletedStr = whmisCompletedDate ? ymd(whmisCompletedDate) : "";
  const whmisExpiryStr = whmisExpiryDate ? ymd(whmisExpiryDate) : "";

  const showMonth = startDate ?? today;
  const matrix = monthMatrix(showMonth.getFullYear(), showMonth.getMonth());

  /* ---------------- UI ---------------- */
  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-6 space-y-6">
      {/* TITLE */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl lg:text-3xl font-bold text-primary">
          Training Progress
        </h1>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 border rounded-full px-3 py-2 text-primary bg-white shadow-sm"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {/* LOADING */}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {/* TOP CARD */}
      {!loading && startDate && (
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
                  <Progress value={tasksPct} className="h-2" />
                  <div className="text-xs text-muted-foreground mt-1">
                    {tasksDone}/{tasksTotal} tasks completed
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CALENDAR */}
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
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
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

          {/* WHMIS SECTION */}
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
                {savingMsg && (
                  <p className="text-green-600 text-xs">{savingMsg}</p>
                )}
                {error && (
                  <p className="text-red-600 text-xs">{error}</p>
                )}

                <button
                  onClick={saveWhmis}
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
