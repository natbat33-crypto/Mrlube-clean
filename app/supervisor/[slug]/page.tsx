"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { db, auth } from "@/lib/firebase";
import {
  collection,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { useSupervisorTrainees } from "@/lib/useSupervisorTrainees";
import { useStoreCtx } from "@/app/providers/StoreProvider";

/* ---------------- Types ---------------- */
type WeekSummary = {
  week: 1 | 2 | 3 | 4;
  waiting: number;
  reviewed: number;
  approved: number;
};

function pickReviewUid(): string {
  if (typeof window === "undefined") return "demo-user";
  return (
    localStorage.getItem("reviewUid") ||
    localStorage.getItem("uid") ||
    "demo-user"
  );
}

/* ---------------- Component ---------------- */
export default function SupervisorPage() {
  const searchParams = useSearchParams();
  const asUid = searchParams.get("as");

  const [uid, setUid] = useState<string>(() => pickReviewUid());
  const [weeks, setWeeks] = useState<WeekSummary[]>([
    { week: 1, waiting: 0, reviewed: 0, approved: 0 },
    { week: 2, waiting: 0, reviewed: 0, approved: 0 },
    { week: 3, waiting: 0, reviewed: 0, approved: 0 },
    { week: 4, waiting: 0, reviewed: 0, approved: 0 },
  ]);
  const [loading, setLoading] = useState(true);

  // Store ID from provider
  const { storeId: ctxStore, loading: ctxLoading } = useStoreCtx();
  const [storeId, setStoreId] = useState<string | null>(null);

  // List of trainees assigned to this store
  const trainees = useSupervisorTrainees(storeId);

  /* ---------------- Handle ?as override ---------------- */
  useEffect(() => {
    if (asUid && asUid !== uid) {
      setUid(asUid);
      localStorage.setItem("reviewUid", asUid);
    }
  }, [asUid, uid]);

  /* ---------------- Determine store ID ---------------- */
  useEffect(() => {
    if (!ctxLoading && ctxStore) {
      setStoreId(String(ctxStore));
    }
  }, [ctxStore, ctxLoading]);

  /* ---------------- Load progress for the trainee (uid) ---------------- */
  useEffect(() => {
    if (!uid || !storeId) return;

    let alive = true;

    (async () => {
      setLoading(true);

      // Read all progress docs
      const progSnap = await getDocs(
        collection(db, "users", uid, "progress")
      );

      const tallies: Record<number, WeekSummary> = {
        1: { week: 1, waiting: 0, reviewed: 0, approved: 0 },
        2: { week: 2, waiting: 0, reviewed: 0, approved: 0 },
        3: { week: 3, waiting: 0, reviewed: 0, approved: 0 },
        4: { week: 4, waiting: 0, reviewed: 0, approved: 0 },
      };

      for (const d of progSnap.docs) {
        const data = d.data() as any;

        // Filter by correct store
        if (String(data.storeId) !== String(storeId)) continue;

        let wk: number | null = null;

        // Check explicit stored week
        if (data.week === "week1") wk = 1;
        else if (data.week === "week2") wk = 2;
        else if (data.week === "week3") wk = 3;
        else if (data.week === "week4") wk = 4;

        // Fallback: parse from path
        if (!wk) {
          const m = (data.path || "").match(/modules\/week(\d)\//i);
          if (m) wk = Number(m[1]);
        }

        if (!wk) continue;

        if (data.done) {
          tallies[wk].reviewed++;
          if (data.approved) tallies[wk].approved++;
          else tallies[wk].waiting++;
        }
      }

      if (!alive) return;
      setWeeks([tallies[1], tallies[2], tallies[3], tallies[4]]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [uid, storeId]);

  /* ---------------- UI ---------------- */
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Supervisor Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Review trainee tasks and approve what’s done.
        </p>

        {/* TEMP DEBUG */}
        <p className="text-red-600 font-bold text-lg mt-2">TEST999</p>
      </header>

      {/* Weekly Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>

      {/* Trainee List */}
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
                    {t.traineeEmail || t.email || t.traineeId}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Tap to review
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
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





