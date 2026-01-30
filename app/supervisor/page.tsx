"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useSupervisorTrainees } from "@/lib/useSupervisorTrainees";
import { db, auth } from "@/lib/firebase";
import { onIdTokenChanged } from "firebase/auth";

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

/* ========================================
   TYPES
======================================== */
type WeekSummary = {
  week: 1 | 2 | 3 | 4;
  waiting: number;
  reviewed: number;
  approved: number;
};

function pickReviewUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("reviewUid") || localStorage.getItem("uid") || null;
}

/* ========================================
   COMPONENT
======================================== */
export default function SupervisorPage() {
  const [uid, setUid] = useState<string | null>(() => pickReviewUid());

  const [weeks, setWeeks] = useState<WeekSummary[]>([
    { week: 1, waiting: 0, reviewed: 0, approved: 0 },
    { week: 2, waiting: 0, reviewed: 0, approved: 0 },
    { week: 3, waiting: 0, reviewed: 0, approved: 0 },
    { week: 4, waiting: 0, reviewed: 0, approved: 0 },
  ]);

  const [day1Summary, setDay1Summary] = useState({
    waiting: 0,
    reviewed: 0,
    approved: 0,
  });

  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);

  const { storeId: resolvedStoreId } = useStoreCtx();
  const trainees = useSupervisorTrainees(storeId);

  const searchParams = useSearchParams();
  const storeOverride = searchParams.get("store");
  const asUid = searchParams.get("as");

  /* ================================
     WEEK SUMMARY — FIXED + MIRRORED
  ================================= */
  useEffect(() => {
    let alive = true;

    async function tally() {
      setLoading(true);

      const tallies: Record<number, WeekSummary> = {
        1: { week: 1, waiting: 0, reviewed: 0, approved: 0 },
        2: { week: 2, waiting: 0, reviewed: 0, approved: 0 },
        3: { week: 3, waiting: 0, reviewed: 0, approved: 0 },
        4: { week: 4, waiting: 0, reviewed: 0, approved: 0 },
      };

      try {
        for (const t of trainees) {
          const traineeId = t.traineeId;

          const snap = await getDocs(
            collection(db, "users", traineeId, "progress")
          );

          for (const d of snap.docs) {
            const data = d.data() as any;
            if (!data?.done) continue;

            let wk: number | null = null;

            if (data.week === "week1") wk = 1;
            if (data.week === "week2") wk = 2;
            if (data.week === "week3") wk = 3;
            if (data.week === "week4") wk = 4;

            if (!wk) continue;

            const b = tallies[wk];
            b.reviewed += 1;
            if (data.approved) b.approved += 1;
            else b.waiting += 1;
          }
        }

        if (alive) {
          setWeeks([tallies[1], tallies[2], tallies[3], tallies[4]]);
        }
      } catch (e) {
        console.error("Supervisor tally error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    }

    tally();
    return () => {
      alive = false;
    };
  }, [trainees]);

  /* ================================
     DAY 1 SUMMARY (UNCHANGED)
  ================================= */
  useEffect(() => {
    let alive = true;

    async function tallyDay1() {
      const summary = { waiting: 0, reviewed: 0, approved: 0 };

      try {
        for (const t of trainees) {
          const snap = await getDocs(
            collection(db, "users", t.traineeId, "progress")
          );

          for (const d of snap.docs) {
            const data: any = d.data();
            if (!data?.done || data.week !== "day-1") continue;

            summary.reviewed += 1;
            if (data.approved) summary.approved += 1;
            else summary.waiting += 1;
          }
        }

        if (alive) setDay1Summary(summary);
      } catch (e) {
        console.error("Day 1 tally error:", e);
      }
    }

    tallyDay1();
    return () => {
      alive = false;
    };
  }, [trainees]);

  /* ================================
     UI
  ================================= */
  const day1Href = uid ? `/supervisor/day1?as=${uid}` : "/supervisor/day1";
  const weekHref = (week: number) =>
    uid ? `/supervisor/week${week}?as=${uid}` : `/supervisor/week${week}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Trainer Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Review trainee tasks and approve what’s done.
        </p>
      </header>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={day1Href}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Day 1</CardTitle>
              <CardDescription>
                {loading
                  ? "Loading…"
                  : `${day1Summary.waiting} pending, ${day1Summary.approved}/${day1Summary.reviewed} approved`}
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>

        {weeks.map((w) => (
          <Link key={w.week} href={weekHref(w.week)}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Week {w.week}</CardTitle>
                <CardDescription>
                  {loading
                    ? "Loading…"
                    : `${w.waiting} pending, ${w.approved}/${w.reviewed} approved`}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}




