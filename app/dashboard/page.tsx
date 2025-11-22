"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, type FC } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock } from "lucide-react";

import TraineeNotesCard from "@/components/notes/TraineeNotesCard";

import { db, auth } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  getCountFromServer,
  setDoc,
} from "firebase/firestore";
import { onIdTokenChanged } from "firebase/auth";

type WeekCard = {
  week: number;
  title: string;
  total: number;
  done: number;
  href?: string;
  comingSoon?: boolean;
};

/* ---------- helpers ---------- */

async function findStoreForTraineeWithoutIndex(
  uid: string
): Promise<string | null> {
  const storesSnap = await getDocs(collection(db, "stores"));
  for (const s of storesSnap.docs) {
    const traineesSnap = await getDocs(
      collection(db, "stores", s.id, "trainees")
    );
    if (traineesSnap.docs.some((d) => d.id === uid)) return s.id;
  }
  return null;
}

function defaultComingSoon(): WeekCard[] {
  return [1, 2, 3, 4].map((w) => ({
    week: w,
    title: `Week ${w}`,
    total: 0,
    done: 0,
    comingSoon: true,
  }));
}

/** Ensure a per-user Day 1 progress doc exists so the UI doesn't look "locked". */
async function ensureDay1ProgressDoc(storeId: string, uid: string) {
  const ref = doc(
    db,
    "stores",
    String(storeId),
    "trainees",
    String(uid),
    "progress",
    "day-1"
  );
  await setDoc(ref, { doneIds: [], updatedAt: Date.now() }, { merge: true });
}

/* ---------- small typed wrapper for TraineeNotesCard ---------- */

interface TraineeNotesCardWrapperProps {
  storeId: string;
  traineeUid: string;
}

const TraineeNotesCardWrapper: FC<TraineeNotesCardWrapperProps> = ({
  storeId,
  traineeUid,
}) => {
  // Cast props as any going into the child so TS stops complaining,
  // but keep strong typing at this level.
  return (
    <TraineeNotesCard
      {...({ storeId, traineeUid } as any)}
    />
  );
};

/* ---------- main trainee dashboard page ---------- */

export default function DashboardPage() {
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [cards, setCards] = useState<WeekCard[]>([]);

  const [storeId, setStoreId] = useState<string | null>(null);
  const [traineeUid, setTraineeUid] = useState<string | null>(null);
  const [resolvingStore, setResolvingStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  // per-week done counts for this trainee
  const [weekDone, setWeekDone] = useState<Record<number, number>>({});

  // Resolve current user + storeId WITHOUT any external provider
  useEffect(() => {
    const stop = onIdTokenChanged(auth, async (u) => {
      setStoreError(null);

      if (!u) {
        setTraineeUid(null);
        setStoreId(null);
        setResolvingStore(false);
        return;
      }

      setTraineeUid(u.uid);
      setResolvingStore(true);

      try {
        let sid: string | null = null;

        // Try users/<uid>
        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const v: any = userSnap.data();
          if (v?.storeId != null) sid = String(v.storeId);
        }

        // Try trainees/<uid>
        if (!sid) {
          const traineeSnap = await getDoc(doc(db, "trainees", u.uid));
          if (traineeSnap.exists()) {
            const tv: any = traineeSnap.data();
            if (tv?.storeId != null) sid = String(tv.storeId);
          }
        }

        // Fallback scan
        if (!sid) {
          sid = await findStoreForTraineeWithoutIndex(u.uid);
        }

        if (!sid) {
          setStoreError("No store assigned to this trainee yet.");
        }
        setStoreId(sid);
      } catch (err) {
        console.error("Error resolving store for trainee:", err);
        setStoreError("Unable to resolve store. Please contact your manager.");
      } finally {
        setResolvingStore(false);
      }
    });

    return () => stop();
  }, []);

  // Seed empty per-user Day 1 progress doc (only when both are known)
  useEffect(() => {
    if (storeId && traineeUid) {
      ensureDay1ProgressDoc(storeId, traineeUid).catch((err) =>
        console.error("ensureDay1ProgressDoc error:", err)
      );
    }
  }, [storeId, traineeUid]);

  // Load Week cards (shared defs only)
  useEffect(() => {
    let cancelled = false;

    const loadWeek = async (
      weekId: string,
      weekNum: number
    ): Promise<WeekCard> => {
      const modRef = doc(db, "modules", weekId);
      const modSnap = await getDoc(modRef);
      const mod = modSnap.exists()
        ? (modSnap.data() as Record<string, unknown>)
        : null;
      const title =
        (mod && (mod["name"] as string)) ||
        (mod && (mod["title"] as string)) ||
        `Week ${weekNum}`;

      const tasksCol = collection(db, "modules", weekId, "tasks");
      const total = (await getCountFromServer(tasksCol)).data().count || 0;
      const done = 0; // per-user progress is loaded separately

      return {
        week: weekNum,
        title,
        total,
        done,
        href: `/dashboard/${weekId}`,
        comingSoon: total === 0,
      };
    };

    (async () => {
      setLoadingWeeks(true);
      try {
        const next = await Promise.all([
          loadWeek("week1", 1),
          loadWeek("week2", 2),
          loadWeek("week3", 3),
          loadWeek("week4", 4),
        ]);
        if (!cancelled) setCards(next);
      } catch (e) {
        console.error("Error loading weeks:", e);
        if (!cancelled) setCards(defaultComingSoon());
      } finally {
        if (!cancelled) setLoadingWeeks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load this trainee's done counts for weeks 1–4 from users/{uid}/progress
  useEffect(() => {
    if (!traineeUid) return;

    let cancelled = false;

    (async () => {
      try {
        const progSnap = await getDocs(
          collection(db, "users", traineeUid, "progress")
        );
        const counts: Record<number, number> = {};

        progSnap.forEach((d) => {
          const data = d.data() as any;
          if (!data?.done) return;

          let wkNum: number | null = null;

          // Prefer explicit week field ("week1", "week2", etc.)
          if (typeof data.week === "string") {
            const m = data.week.match(/^week(\d)$/i);
            if (m) wkNum = Number(m[1]);
          }

          // Fallback to ID pattern: modules__week2__tasks__<id>
          if (!wkNum) {
            const m2 = d.id.match(/^modules__week(\d)__tasks__/i);
            if (m2) wkNum = Number(m2[1]);
          }

          if (!wkNum || wkNum < 1 || wkNum > 4) return;

          counts[wkNum] = (counts[wkNum] || 0) + 1;
        });

        if (!cancelled) setWeekDone(counts);
      } catch (e) {
        if (!cancelled)
          console.error("Error loading trainee week progress:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [traineeUid]);

  const list = loadingWeeks ? defaultComingSoon() : cards;
  const isResolving = resolvingStore;

  /* ---------- UI ---------- */

  if (isResolving && !storeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 text-sm">
          Loading your trainee dashboard…
        </p>
      </div>
    );
  }

  if (!isResolving && storeError && !storeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-xl font-semibold text-primary">
            Trainee Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">{storeError}</p>
          <p className="text-xs text-muted-foreground">
            Please ask your manager to assign you to a store in the system.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
      <div className="space-y-4 lg:space-y-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-primary">
            Mr. Lube Training Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 lg:mt-2 text-sm lg:text-base">
            Track your training progress and complete required tasks.
          </p>
        </div>

        <div className="grid gap-3 lg:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {/* Day 1 per-user progress card */}
          {storeId && traineeUid ? (
            <Day1Card storeId={storeId} traineeUid={traineeUid} />
          ) : (
            <Day1Card />
          )}

          {list.map((c) => {
            const done = weekDone[c.week] ?? c.done;
            const pct = c.total > 0 ? Math.round((done / c.total) * 100) : 0;

            const body = (
              <Card
                key={c.week}
                className={`border-primary/20 ${
                  c.comingSoon ? "opacity-70" : ""
                }`}
              >
                <CardHeader className="pb-2 lg:pb-3">
                  <CardTitle className="text-base lg:text-lg">
                    Week {c.week}
                  </CardTitle>
                  <CardDescription className="text-xs lg:text-sm">
                    {c.title}
                    {c.comingSoon ? " • Coming soon" : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs lg:text-sm">
                      <span>Progress</span>
                      <span className="text-black">{pct}%</span>
                    </div>
                    <Progress
                      value={pct}
                      className="h-2 [&>div]:bg-yellow-400"
                    />
                    <p className="text-xs text-muted-foreground">
                      {done}/{c.total} tasks completed
                    </p>
                  </div>
                </CardContent>
              </Card>
            );

            return c.href ? (
              <Link
                key={`link-${c.week}`}
                href={c.href}
                className="block focus:outline-none"
              >
                {body}
              </Link>
            ) : (
              <div key={`week-${c.week}`}>{body}</div>
            );
          })}
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg lg:text-xl">
              <CheckCircle className="h-5 w-5 text-primary" />
              Your Training Journey
            </CardTitle>
            <CardDescription className="text-sm lg:text-base">
              Continue your Mr. Lube training program.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 lg:gap-4">
            <Link
              href="/dashboard/progress"
              className="block focus:outline-none"
            >
              <Card className="bg-primary/10 border-primary/20 hover:shadow-md transition">
                <CardContent className="p-3 lg:p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Clock className="h-6 w-6 lg:h-8 lg:w-8 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-sm lg:text-base">
                        Track Progress
                      </p>
                      <p className="text-xs lg:text-sm text-muted-foreground">
                        30-day countdown and weekly calendar.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>

            {typeof storeId === "string" &&
              typeof traineeUid === "string" && (
                <div className="mt-2">
                  <TraineeNotesCardWrapper
                    storeId={storeId}
                    traineeUid={traineeUid}
                  />
                </div>
              )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Day 1 per-user card (typed so TS is happy) ---------- */

interface Day1CardProps {
  storeId?: string;
  traineeUid?: string;
}

const Day1Card: FC<Day1CardProps> = ({ storeId, traineeUid }) => {
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [title, setTitle] = useState<string>("Orientation");

  const pct = useMemo(
    () => (total ? Math.round((done / total) * 100) : 0),
    [done, total]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // Shared title + tasks list (definitions)
        const dayDoc = await getDoc(doc(db, "days", "day-1"));
        if (alive && dayDoc.exists()) {
          const data = dayDoc.data() as Record<string, unknown>;
          const t =
            (data["title"] as string) || (data["name"] as string);
          if (t) setTitle(t);
        }

        const snap = await getDocs(collection(db, "days", "day-1", "tasks"));
        if (!alive) return;
        const taskIds = snap.docs.map((d) => d.id);
        setTotal(taskIds.length);

        // Per-user completion (doesn't touch shared defs)
        let userDone = 0;
        if (storeId && traineeUid) {
          const progRef = doc(
            db,
            "stores",
            String(storeId),
            "trainees",
            String(traineeUid),
            "progress",
            "day-1"
          );
          const progSnap = await getDoc(progRef);
          if (progSnap.exists()) {
            const p = progSnap.data() as any;
            const doneIds: string[] = Array.isArray(p?.doneIds)
              ? p.doneIds
              : [];
            userDone = doneIds.filter((id) =>
              taskIds.includes(id)
            ).length;
          }
        }

        if (alive) setDone(userDone);
      } catch (e) {
        console.error("Day1Card load error:", e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [storeId, traineeUid]);

  return (
    <Link href="/dashboard/day-1" className="block focus:outline-none">
      <Card className="border-primary/20">
        <CardHeader className="pb-2 lg:pb-3">
          <CardTitle className="text-base lg:text-lg">{title}</CardTitle>
          <CardDescription className="text-xs lg:text-sm">
            Day 1
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs lg:text-sm">
              <span>Progress</span>
              <span className="text-black">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            <p className="text-xs text-muted-foreground">
              {done}/{total || 6} tasks completed
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

