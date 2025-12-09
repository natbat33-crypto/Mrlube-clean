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

// ========================================
// TYPES
// ========================================
type WeekSummary = {
  week: 1 | 2 | 3 | 4;
  waiting: number;
  reviewed: number;
  approved: number;
};

function pickReviewUid(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("reviewUid") ||
    localStorage.getItem("uid") ||
    null
  );
}

async function resolveStoreId(): Promise<string> {
  const u = auth.currentUser;
  if (u) {
    const tok = await u.getIdTokenResult(true);
    if (tok?.claims?.storeId) return String(tok.claims.storeId);
  }

  if (typeof window !== "undefined") {
    const ls = localStorage.getItem("storeId");
    if (ls) return String(ls);
  }

  if (u) {
    const peek = ["24", "26", "262", "276", "298", "46", "79", "163"];
    for (const sid of peek) {
      const snap = await getDoc(doc(db, "stores", sid, "employees", u.uid));
      if (snap.exists()) return sid;
    }
  }

  return "";
}

// ========================================
// COMPONENT
// ========================================
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

  // =========================================================
  // HANDLE ?as=
  // =========================================================
  useEffect(() => {
    if (asUid && asUid !== uid) setUid(asUid);
  }, [asUid, uid]);

  useEffect(() => {
    if (!uid && trainees.length > 0) setUid(trainees[0].traineeId);
  }, [uid, trainees]);

  useEffect(() => {
    if (uid && typeof window !== "undefined") {
      localStorage.setItem("reviewUid", uid);
    }
  }, [uid]);

  // =========================================================
  // STORE OVERRIDES
  // =========================================================
  useEffect(() => {
    if (storeOverride) setStoreId(storeOverride);
  }, [storeOverride]);

  useEffect(() => {
    if (!asUid) return;
    (async () => {
      const snap = await getDoc(doc(db, "users", asUid));
      const v: any = snap.exists() ? snap.data() : null;
      setStoreId(v?.storeId ? String(v.storeId) : null);
    })();
  }, [asUid]);

  useEffect(() => {
    if (!storeOverride && !asUid && resolvedStoreId) {
      setStoreId(resolvedStoreId);
    }
  }, [resolvedStoreId, storeOverride, asUid]);

  // =========================================================
  // FALLBACK STORE DETECTION
  // =========================================================
  useEffect(() => {
    if (storeOverride || asUid || resolvedStoreId) return;

    let stopUserListener: null | (() => void) = null;

    const stopAuth = onIdTokenChanged(auth, (u) => {
      if (stopUserListener) {
        stopUserListener();
        stopUserListener = null;
      }

      if (!u) {
        setStoreId(null);
        return;
      }

      const userRef = doc(db, "users", u.uid);
      stopUserListener = onSnapshot(userRef, async (snap) => {
        const v: any = snap.exists() ? snap.data() : null;
        let sid = v?.storeId ?? null;

        if (!sid) {
          try {
            const storesSnap = await getDocs(collection(db, "stores"));
            for (const s of storesSnap.docs) {
              const empRef = doc(db, "stores", s.id, "employees", u.uid);
              const empSnap = await getDoc(empRef);
              if (empSnap.exists()) {
                const data: any = empSnap.data();
                if (data?.active === false) continue;
                sid = s.id;
                break;
              }
            }
          } catch {}
        }

        if (!sid) {
          try {
            const qs = await getDocs(
              query(
                collection(db, "stores"),
                where("supervisorUid", "==", u.uid),
                limit(1)
              )
            );
            if (!qs.empty) sid = qs.docs[0].id;
          } catch {}
        }

        setStoreId(sid);
      });
    });

    return () => {
      if (stopUserListener) stopUserListener();
      stopAuth();
    };
  }, [storeOverride, asUid, resolvedStoreId]);

  // =========================================================
  // WEEK SUMMARY TALLY
  // =========================================================
  useEffect(() => {
    let alive = true;

    async function tally() {
      setLoading(true);

      let sid = storeId;
      if (!sid) {
        sid = await resolveStoreId();
        if (!alive) return;
        if (sid) setStoreId(sid);
      }

      if (!sid) {
        if (!alive) return;
        setLoading(false);
        return;
      }

      const tallies: Record<number, WeekSummary> = {
        1: { week: 1, waiting: 0, reviewed: 0, approved: 0 },
        2: { week: 2, waiting: 0, reviewed: 0, approved: 0 },
        3: { week: 3, waiting: 0, reviewed: 0, approved: 0 },
        4: { week: 4, waiting: 0, reviewed: 0, approved: 0 },
      };

      try {
        const traineesSnap = await getDocs(
          collection(db, "stores", String(sid), "trainees")
        );

        for (const t of traineesSnap.docs) {
          const traineeId = t.id;
          const progSnap = await getDocs(
            collection(db, "users", traineeId, "progress")
          );

          for (const d of progSnap.docs) {
            const data = d.data() as any;
            if (!data?.done) continue;
            if (String(data.storeId) !== String(sid)) continue;

            let wk: number | null = null;

            if (data.week === "week1") wk = 1;
            else if (data.week === "week2") wk = 2;
            else if (data.week === "week3") wk = 3;
            else if (data.week === "week4") wk = 4;

            if (!wk && data.path) {
              const m = data.path.match(/modules\/week(\d)\//i);
              if (m) wk = Number(m[1]);
            }

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
      } catch (err) {
        console.error(err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    tally();
    return () => {
      alive = false;
    };
  }, [storeId]);

  // =========================================================
  // ⭐ DAY-1 SUMMARY — FIXED HERE ⭐
  // =========================================================
  useEffect(() => {
    if (!storeId) return;

    let alive = true;

    async function tallyDay1() {
      const summary = { waiting: 0, reviewed: 0, approved: 0 };

      try {
        const traineesSnap = await getDocs(
          collection(db, "stores", String(storeId), "trainees")
        );

        for (const t of traineesSnap.docs) {
          const traineeId = t.id;

          const progSnap = await getDocs(
            collection(db, "users", traineeId, "progress")
          );

          for (const d of progSnap.docs) {
            const data: any = d.data();
            if (!data?.done) continue;
            if (data.week !== "day-1") continue;

            // ⭐ FIX: Day-1 progress often lacks storeId, so skip store check ONLY for day-1
            if (data.week !== "day-1" &&
                String(data.storeId) !== String(storeId)) {
              continue;
            }

            summary.reviewed += 1;
            if (data.approved) summary.approved += 1;
            else summary.waiting += 1;
          }
        }

        if (alive) setDay1Summary(summary);
      } catch (err) {
        console.error("Day 1 tally error:", err);
      }
    }

    tallyDay1();
    return () => {
      alive = false;
    };
  }, [storeId]);

  // =========================================================
  // UI
  // =========================================================
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

      {/* DAY-1 CARD WITH FIXED COUNTS */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">

        <Link href={day1Href}>
          <Card className="border-primary/20 hover:shadow-md cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Day 1</CardTitle>
              <CardDescription>
                {loading
                  ? "Loading…"
                  : `${day1Summary.waiting} pending, ${day1Summary.approved}/${day1Summary.reviewed} approved`}
              </CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>

        {/* WEEK CARDS unchanged */}
        {weeks.map((w) => (
          <Link key={w.week} href={weekHref(w.week)}>
            <Card className="border-primary/20 hover:shadow-md cursor-pointer">
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

      {/* TRAINEES */}
      {storeId && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Your Trainees</h2>

          {trainees.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trainees assigned yet.</p>
          ) : (
            <div className="grid gap-2">
              {trainees.map((t) => (
                <Link
                  key={t.id}
                  href={`/supervisor/day1?as=${t.traineeId}`}
                  className="block border p-3 rounded-lg bg-white hover:bg-primary/5 transition"
                >
                  <div className="font-medium">
                    {t.email || t.traineeEmail || t.userEmail || t.traineeId}
                  </div>
                  <div className="text-xs text-muted-foreground">Tap to review</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NOTES LINK */}
      {storeId && (
        <Link href={`/supervisor/notes?store=${storeId}`}>
          <Card className="border-primary/30 hover:bg-primary/5 cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-primary">Notes</CardTitle>
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






