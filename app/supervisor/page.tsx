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

  const { storeId: resolvedStoreId, loading: storeCtxLoading } = useStoreCtx();
  const trainees = useSupervisorTrainees(storeId);

  const searchParams = useSearchParams();
  const storeOverride = searchParams.get("store");
  const asUid = searchParams.get("as");

  // AS override
  useEffect(() => {
    if (asUid && asUid !== uid) setUid(asUid);
  }, [asUid, uid]);

  // Save UID
  useEffect(() => {
    if (uid && typeof window !== "undefined") {
      localStorage.setItem("reviewUid", uid);
    }
  }, [uid]);

  // Store override
  useEffect(() => {
    if (!storeOverride) return;
    setStoreId(String(storeOverride));
  }, [storeOverride]);

  // Get store from trainee user doc
  useEffect(() => {
    if (!asUid) return;

    (async () => {
      const snap = await getDoc(doc(db, "users", asUid));
      const d: any = snap.exists() ? snap.data() : null;
      setStoreId(d?.storeId ? String(d.storeId) : null);
    })();
  }, [asUid]);

  // store via provider
  useEffect(() => {
    if (storeOverride || asUid) return;
    if (resolvedStoreId) setStoreId(resolvedStoreId);
  }, [resolvedStoreId, storeCtxLoading, storeOverride, asUid]);

  // fallback resolver
  useEffect(() => {
    if (storeOverride || asUid) return;
    if (resolvedStoreId) return;

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

      const ref = doc(db, "users", u.uid);
      stopUserListener = onSnapshot(ref, async (snap) => {
        const v: any = snap.exists() ? snap.data() : null;
        let sid = v?.storeId ?? null;

        if (!sid) {
          const snap = await getDocs(collection(db, "stores"));
          for (const s of snap.docs) {
            const emp = await getDoc(doc(db, "stores", s.id, "employees", u.uid));
            if (emp.exists()) {
              const d: any = emp.data();
              if (d?.active !== false) sid = s.id;
            }
          }
        }

        if (!sid) {
          const qs = await getDocs(
            query(collection(db, "stores"), where("supervisorUid", "==", u.uid), limit(1))
          );
          if (!qs.empty) sid = qs.docs[0].id;
        }

        setStoreId(sid);
      });
    });

    return () => {
      if (stopUserListener) stopUserListener();
      stopAuth();
    };
  }, [storeOverride, asUid, resolvedStoreId]);

  // Tally Week approvals
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
        const usersSnap = await getDocs(collection(db, "users"));

        for (const u of usersSnap.docs) {
          const traineeId = u.id;
          const pSnap = await getDocs(collection(db, "users", traineeId, "progress"));

          for (const d of pSnap.docs) {
            const row: any = d.data();
            if (!row.done) continue;
            if (row.storeId !== sid) continue;

            let wk = null;

            if (row.week === "week1") wk = 1;
            else if (row.week === "week2") wk = 2;
            else if (row.week === "week3") wk = 3;
            else if (row.week === "week4") wk = 4;
            else if (row.path) {
              const m = row.path.match(/modules\/week(\d)\//i);
              if (m) wk = Number(m[1]);
            }

            if (!wk) continue;

            tallies[wk].reviewed++;
            if (row.approved) tallies[wk].approved++;
            else tallies[wk].waiting++;
          }
        }

        if (!alive) return;
        setWeeks([tallies[1], tallies[2], tallies[3], tallies[4]]);
      } catch {
      } finally {
        if (alive) setLoading(false);
      }
    }

    tally();
    return () => {
      alive = false;
    };
  }, [storeId]);

  // ---------------- RENDER ----------------

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Trainer Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Review trainee tasks and approve what's done.
        </p>
      </header>

      {/* DAY 1 CARD */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">

        <Link href={`/supervisor/day1`} className="block">
          <Card className="border-primary/20 hover:shadow-md transition cursor-pointer">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Day 1</CardTitle>
              <CardDescription>Orientation Tasks</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>

        {/* WEEK CARDS */}
        {weeks.map((w) => (
          <Link key={w.week} href={`/supervisor/week${w.week}`} className="block">
            <Card className="border-primary/20 hover:shadow-md transition cursor-pointer">
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
                  <div className="text-xs text-muted-foreground">
                    Review Day 1
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* NOTES */}
      {storeId && (
        <Link
          href={`/supervisor/notes?store=${encodeURIComponent(storeId)}`}
          className="block"
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








