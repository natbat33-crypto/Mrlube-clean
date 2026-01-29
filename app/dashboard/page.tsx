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
  doc,
  getDoc,
  getCountFromServer,
  setDoc,
  onSnapshot,
} from "firebase/firestore";
import { onIdTokenChanged } from "firebase/auth";

/* ------------------ types ------------------ */
type WeekCard = {
  week: number;
  title: string;
  total: number;
  done: number;
  href?: string;
  comingSoon?: boolean;
};

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

interface TraineeNotesCardWrapperProps {
  storeId: string;
  traineeUid: string;
}

const TraineeNotesCardWrapper: FC<TraineeNotesCardWrapperProps> = ({
  storeId,
  traineeUid,
}) => {
  return <TraineeNotesCard {...({ storeId, traineeUid } as any)} />;
};

/* ------------------ AUTHORITY (SOURCE OF TRUTH) ------------------ */
/**
 * Source of truth:
 * users/{uid}/sections/{sectionId}.approved === true => approved
 * missing/false/undefined => not approved
 *
 * IMPORTANT: use onSnapshot so old users get locked immediately when approvals change.
 */
type SectionId = "day1" | "week1" | "week2" | "week3";

function sectionRef(uid: string, sectionId: SectionId) {
  return doc(db, "users", uid, "sections", sectionId);
}

/* ------------------ main page ------------------ */

export default function DashboardPage() {
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [cards, setCards] = useState<WeekCard[]>([]);

  const [storeId, setStoreId] = useState<string | null>(null);
  const [traineeUid, setTraineeUid] = useState<string | null>(null);
  const [resolvingStore, setResolvingStore] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [weekDone, setWeekDone] = useState<Record<number, number>>({});

  // 🔒 week gating (AUTHORITY)
  const [weekUnlocked, setWeekUnlocked] = useState<Record<number, boolean>>({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  // local approved flags (live)
  const [approved, setApproved] = useState<Record<SectionId, boolean>>({
    day1: false,
    week1: false,
    week2: false,
    week3: false,
  });

  /* ---------- resolve trainee + store ---------- */
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

        const userSnap = await getDoc(doc(db, "users", u.uid));
        if (userSnap.exists()) {
          const v: any = userSnap.data();
          if (v?.storeId) sid = String(v.storeId);
        }

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

  /* ---------- reset progress when trainee changes ---------- */
  useEffect(() => {
    setWeekDone({});
    setWeekUnlocked({ 1: false, 2: false, 3: false, 4: false });
    setApproved({ day1: false, week1: false, week2: false, week3: false });
  }, [traineeUid]);

  /* ---------- ensure Day1 doc ---------- */
  useEffect(() => {
    if (storeId && traineeUid) {
      ensureDay1ProgressDoc(storeId, traineeUid).catch((err) =>
        console.error("ensureDay1ProgressDoc error:", err)
      );
    }
  }, [storeId, traineeUid]);

  /* ---------- load week cards ---------- */
  useEffect(() => {
    let cancelled = false;

    const loadWeek = async (
      weekId: string,
      weekNum: number
    ): Promise<WeekCard> => {
      const modRef = doc(db, "modules", weekId);
      const modSnap = await getDoc(modRef);
      const mod = modSnap.exists() ? (modSnap.data() as any) : null;

      const title = mod?.name || mod?.title || `Week ${weekNum}`;

      const tasksCol = collection(db, "modules", weekId, "tasks");
      const total = (await getCountFromServer(tasksCol)).data().count || 0;

      return {
        week: weekNum,
        title,
        total,
        done: 0,
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
        console.error("Error loading modules:", e);
        if (!cancelled) setCards(defaultComingSoon());
      } finally {
        if (!cancelled) setLoadingWeeks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- load progress from users/<uid>/progress (weeks 1–4) ---------- */
  useEffect(() => {
    if (!traineeUid) return;

    let cancelled = false;

    (async () => {
      try {
        const progSnap = await getDocs(
          collection(db, "users", traineeUid, "progress")
        );

        const counts: Record<number, number> = {};

        progSnap.forEach((d: any) => {
          const data: any = d.data();
          if (!data?.done) return;

          let wkNum: number | null = null;

          if (typeof data.week === "string") {
            const m = data.week.match(/^week(\d)$/i);
            if (m) wkNum = Number(m[1]);
          }

          if (!wkNum || wkNum < 1 || wkNum > 4) return;

          counts[wkNum] = (counts[wkNum] || 0) + 1;
        });

        if (!cancelled) setWeekDone(counts);
      } catch (e) {
        console.error("Error loading trainee week progress:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [traineeUid]);

  /* ---------- LIVE AUTHORITY SUBSCRIPTIONS (NO HISTORY, CURRENT STATE WINS) ---------- */
  useEffect(() => {
    if (!traineeUid) return;

    const unsubs: Array<() => void> = [];

    (["day1", "week1", "week2", "week3"] as SectionId[]).forEach((sid) => {
      const unsub = onSnapshot(
        sectionRef(traineeUid, sid),
        (snap) => {
          const ok = snap.exists() && snap.data()?.approved === true;
          setApproved((prev) => (prev[sid] === ok ? prev : { ...prev, [sid]: ok }));
        },
        (e) => console.error(`[dashboard] sections/${sid} snapshot error`, e)
      );
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [traineeUid]);

  /* ---------- COMPUTE GATES (AUTHORITATIVE, CURRENT STATE) ---------- */
  useEffect(() => {
    // Week1 requires day1 approved
    // Week2 requires week1 approved
    // Week3 requires week2 approved
    // Week4 requires week3 approved
    setWeekUnlocked({
      1: approved.day1 === true,
      2: approved.week1 === true,
      3: approved.week2 === true,
      4: approved.week3 === true,
    });
  }, [approved.day1, approved.week1, approved.week2, approved.week3]);

  const list = loadingWeeks ? defaultComingSoon() : cards;
  const isResolving = resolvingStore;

  /* ---------- UI ---------- */

  if (isResolving && !storeId) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 text-sm">
          Loading your trainee dashboard…
        </p>
      </div>
    );
  }

  if (!isResolving && storeError && !storeId) {
    return (
      <div className="min-h-[100svh] flex items-center justify-center bg-slate-50">
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
    <div key={traineeUid} className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
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
          {storeId && traineeUid ? (
            <Day1Card storeId={storeId} traineeUid={traineeUid} />
          ) : (
            <Day1Card />
          )}

          {list.map((c) => {
            const done = weekDone[c.week] ?? c.done;
            const pct = c.total > 0 ? Math.round((done / c.total) * 100) : 0;

            const unlocked = weekUnlocked[c.week] ?? false;

            const lockMsg =
              c.week === 1
                ? "Complete Day 1 to unlock"
                : "Complete previous section to unlock";

            const cardBody = (
              <Card
                className={`border-primary/20 ${
                  !unlocked ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <CardHeader className="pb-2 lg:pb-3">
                  <CardTitle className="text-base lg:text-lg">
                    Week {c.week}
                  </CardTitle>
                  <CardDescription className="text-xs lg:text-sm">
                    {c.title}
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
                    {!unlocked && (
                      <p className="text-xs text-red-500">{lockMsg}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {done}/{c.total} tasks completed
                    </p>
                  </div>
                </CardContent>
              </Card>
            );

            // locked OR missing href => not clickable
            if (!unlocked || !c.href) {
              return (
                <div key={`week-${c.week}`} className="block">
                  {cardBody}
                </div>
              );
            }

            return (
              <Link key={`link-${c.week}`} href={c.href} className="block">
                {cardBody}
              </Link>
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
            <Link href="/dashboard/progress" className="block">
              <Card className="bg-primary/10 border-primary/20 hover:shadow-md transition">
                <CardContent className="p-3 lg:p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Clock className="h-6 w-6 lg:h-8 lg:w-8 text-primary" />
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

/* ------------------ Day 1 Card ------------------ */

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

  // reset when switching user
  useEffect(() => {
    setDone(0);
    setTotal(0);
  }, [traineeUid]);

  // LIVE Day-1 progress from Firestore
  useEffect(() => {
    if (!storeId || !traineeUid) return;

    let alive = true;

    // Set title once
    getDoc(doc(db, "days", "day-1"))
      .then((dayDoc) => {
        if (!alive || !dayDoc.exists()) return;
        const d = dayDoc.data() as any;
        const t = d?.title || d?.name;
        if (t) setTitle(t);
      })
      .catch((e) => console.error("Day1 title error:", e));

    // Listen to Day-1 tasks for total
    const tasksCol = collection(db, "days", "day-1", "tasks");
    const unsubTasks = onSnapshot(
      tasksCol,
      (snap: any) => {
        if (!alive) return;
        const ids = snap.docs.map((d: any) => d.id);
        setTotal(ids.length);
      },
      (e: unknown) => console.error("Day1 tasks snapshot error:", e)
    );

    // Listen to trainee progress for doneIds
    const progRef = doc(
      db,
      "stores",
      String(storeId),
      "trainees",
      String(traineeUid),
      "progress",
      "day-1"
    );

    const unsubProg = onSnapshot(
      progRef,
      (snap: any) => {
        if (!alive) return;
        if (!snap.exists()) {
          setDone(0);
          return;
        }
        const p = snap.data() as any;
        const doneIds: string[] = Array.isArray(p?.doneIds) ? p.doneIds : [];
        setDone(doneIds.length);
      },
      (e: unknown) => console.error("Day1 progress snapshot error:", e)
    );

    return () => {
      alive = false;
      unsubTasks();
      unsubProg();
    };
  }, [storeId, traineeUid]);

  return (
    <Link href="/dashboard/day-1" className="block">
      <Card className="border-primary/20">
        <CardHeader className="pb-2 lg:pb-3">
          <CardTitle className="text-base lg:text-lg">{title}</CardTitle>
          <CardDescription className="text-xs lg:text-sm">Day 1</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs lg:text-sm">
              <span>Progress</span>
              <span className="text-black">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            <p className="text-xs text-muted-foreground">
              {done}/{total} tasks completed
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};