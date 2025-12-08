"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useSupervisorTrainees } from "@/lib/useSupervisorTrainees";
import { db, auth } from "@/lib/firebase";

import {
  collection,
  getDocs,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useStoreCtx } from "@/app/providers/StoreProvider";

type WeekSummary = {
  week: 1 | 2 | 3 | 4;
  waiting: number;
  reviewed: number;
  approved: number;
};

/* ------------------ UID helper ------------------ */
function pickReviewUid(): string {
  if (typeof window === "undefined") return "demo-user";
  return (
    localStorage.getItem("reviewUid") ||
    localStorage.getItem("uid") ||
    "demo-user"
  );
}

export default function SupervisorPage() {
  const [uid, setUid] = useState<string>(() => pickReviewUid());
  const [weeks, setWeeks] = useState<WeekSummary[]>([
    { week: 1, waiting: 0, reviewed: 0, approved: 0 },
    { week: 2, waiting: 0, reviewed: 0, approved: 0 },
    { week: 3, waiting: 0, reviewed: 0, approved: 0 },
    { week: 4, waiting: 0, reviewed: 0, approved: 0 },
  ]);
  const [loading, setLoading] = useState(true);

  const [storeId, setStoreId] = useState<string | null>(null);
  const { storeId: ctxStore, loading: ctxLoading } = useStoreCtx();

  const trainees = useSupervisorTrainees(storeId);
  const searchParams = useSearchParams();
  const asUid = searchParams.get("as");

  /* use ?as override */
  useEffect(() => {
    if (asUid && asUid !== uid) setUid(asUid);
  }, [asUid, uid]);

  /* remember reviewer */
  useEffect(() => {
    if (uid && typeof window !== "undefined") {
      localStorage.setItem("reviewUid", uid);
    }
  }, [uid]);

  /* get storeId from context provider */
  useEffect(() => {
    if (!ctxLoading && ctxStore) setStoreId(ctxStore);
  }, [ctxStore, ctxLoading]);

  /* weekly tallies logic (KEEPING YOUR ORIGINAL SYSTEM) */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        const snap = await getDocs(collection(db, "users", uid, "progress"));

        const tallies: Record<number, WeekSummary> = {
          1: { week: 1, waiting: 0, reviewed: 0, approved: 0 },
          2: { week: 2, waiting: 0, reviewed: 0, approved: 0 },
          3: { week: 3, waiting: 0, reviewed: 0, approved: 0 },
          4: { week: 4, waiting: 0, reviewed: 0, approved: 0 },
        };

        for (const d of snap.docs) {
          const data = d.data() as any;

          // IN your system weeks are mapped from data.path
          const wkMatch = (data.path || "").match(/modules\/week(\d)\//i);
          if (!wkMatch) continue;

          const wk = Number(wkMatch[1]) as 1 | 2 | 3 | 4;
          if (data.done) {
            tallies[wk].reviewed++;
            if (data.approved) tallies[wk].approved++;
            else tallies[wk].waiting++;
          }
        }

        if (!alive) return;
        setWeeks([tallies[1], tallies[2], tallies[3], tallies[4]]);
      } catch (e) {
        console.log("tally error", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [uid]);

  /* ---------------- RENDER UI ---------------- */
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">
          Supervisor Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Review trainee tasks and approve what’s done.
        </p>
      </header>

      {/* ---------------- DAY 1 CARD (NEW) ---------------- */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">

        {/* DAY ONE CARD */}
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Day 1</CardTitle>
            <CardDescription>Orientation Tasks</CardDescription>
          </CardHeader>

          {trainees.map((t) => (
            <Link
              key={t.id}
              href={`/supervisor/day1?as=${t.traineeId}`}
              className="block p-2 text-sm text-blue-600 hover:underline"
            >
              Review Day-1 for {t.traineeEmail || t.traineeId}
            </Link>
          ))}
        </Card>

        {/* WEEK CARDS (existing system untouched) */}
        {weeks.map((w) => (
          <Link
            key={w.week}
            href={`/supervisor/week${w.week}?as=${uid}`}
            className="block"
          >
            <Card className="border-primary/20 hover:shadow-md cursor-pointer transition">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Week {w.week}</CardTitle>
                <CardDescription>
                  {loading
                    ? "Loading…"
                    : `${w.waiting} pending, ${w.approved}/${w.reviewed} approved`}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* ---------------- TRAINEES BELOW ---------------- */}
      {storeId && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Your Trainees</h2>

          {trainees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No trainees assigned yet.
            </p>
          ) : (
            <div className="grid gap-2">
              {trainees.map((t) => (
                <Link
                  key={t.id}
                  href={`/supervisor/week1?as=${t.traineeId}`}
                  className="block border p-3 rounded-lg bg-white hover:bg-primary/5 transition"
                >
                  <div className="font-medium">
                    {t.traineeEmail || t.traineeId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Tap to review Week-1
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---------------- NOTES ---------------- */}
      {storeId && (
        <Link
          href={`/supervisor/notes?store=${storeId}`}
          className="block focus:outline-none"
        >
          <Card className="border-primary/30 bg-white hover:bg-primary/5 transition">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-primary">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Open your notes
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}





