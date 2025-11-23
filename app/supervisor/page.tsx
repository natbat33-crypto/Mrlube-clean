// app/supervisor/page.tsx
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

// -------- REAL UID ONLY — NO DEMO, NO OVERRIDES ----------
export default function SupervisorPage() {
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    return onIdTokenChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    });
  }, []);

  const [weeks, setWeeks] = useState<WeekSummary[]>([
    { week: 1, waiting: 0, reviewed: 0, approved: 0 },
    { week: 2, waiting: 0, reviewed: 0, approved: 0 },
    { week: 3, waiting: 0, reviewed: 0, approved: 0 },
    { week: 4, waiting: 0, reviewed: 0, approved: 0 },
  ]);

  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [resolvingStore, setResolvingStore] = useState(true);

  const { storeId: resolvedStoreId, loading: storeCtxLoading } = useStoreCtx();
  const trainees = storeId ? useSupervisorTrainees(storeId) : [];

  const searchParams = useSearchParams();
  const storeOverride = searchParams.get("store");
  const asUid = searchParams.get("as");

  // -------- STORE OVERRIDE ----------
  useEffect(() => {
    if (!storeOverride) return;
    setStoreId(String(storeOverride));
    setResolvingStore(false);
  }, [storeOverride]);

  // -------- PICK STORE FROM asUid WHEN REVIEWING ----------
  useEffect(() => {
    if (!asUid) return;

    (async () => {
      setResolvingStore(true);
      const snap = await getDoc(doc(db, "users", asUid));
      const v: any = snap.exists() ? snap.data() : null;
      const sid = v?.storeId ?? null;
      setStoreId(sid ? String(sid) : null);
      setResolvingStore(false);
    })();
  }, [asUid]);

  // -------- PROVIDER STORE WHEN AVAILABLE ----------
  useEffect(() => {
    if (storeOverride || asUid) return;
    if (resolvedStoreId) {
      setStoreId(resolvedStoreId);
      setResolvingStore(false);
    }
  }, [resolvedStoreId, storeCtxLoading, storeOverride, asUid]);

  // -------- FALLBACK: INFERS STORE FROM EMPLOYEES / SUPERVISOR ----------
  useEffect(() => {
    if (storeOverride || asUid) return;
    if (resolvedStoreId) return;

    let stopUserListener: (() => void) | null = null;

    const stopAuth = onIdTokenChanged(auth, (u) => {
      if (stopUserListener) {
        stopUserListener();
        stopUserListener = null;
      }

      if (!u) {
        setStoreId(null);
        setResolvingStore(false);
        return;
      }

      setResolvingStore(true);
      const userRef = doc(db, "users", u.uid);

      stopUserListener = onSnapshot(userRef, async (snap) => {
        const v: any = snap.exists() ? snap.data() : null;
        let sid: string | null = v?.storeId ?? null;

        if (!sid) {
          const storesSnap = await getDocs(collection(db, "stores"));
          for (const s of storesSnap.docs) {
            const empRef = doc(db, "stores", s.id, "employees", u.uid);
            const empSnap = await getDoc(empRef);
            if (empSnap.exists() && empSnap.data()?.active !== false) {
              sid = s.id;
              break;
            }
          }
        }

        if (!sid) {
          const qs = await getDocs(
            query(
              collection(db, "stores"),
              where("supervisorUid", "==", u.uid),
              limit(1)
            )
          );
          if (!qs.empty) sid = qs.docs[0].id;
        }

        setStoreId(sid);
        setResolvingStore(false);
      });
    });

    return () => {
      if (stopUserListener) stopUserListener();
      stopAuth();
    };
  }, [storeOverride, asUid, resolvedStoreId]);

  // -------- BLOCK UNTIL UID EXISTS ----------
  if (!uid) {
    return (
      <div className="p-4 text-sm text-gray-600">Loading supervisor…</div>
    );
  }

  // -------- BLOCK UNTIL STORE IS KNOWN ----------
  if (resolvingStore) {
    return (
      <div className="p-4 text-sm text-gray-600">
        Checking store assignment…
      </div>
    );
  }

  // -------- TALLY LOGIC (unchanged) ----------
  useEffect(() => {
    let alive = true;

    async function tally() {
      setLoading(true);

      if (!storeId) {
        setWeeks([
          { week: 1, waiting: 0, reviewed: 0, approved: 0 },
          { week: 2, waiting: 0, reviewed: 0, approved: 0 },
          { week: 3, waiting: 0, reviewed: 0, approved: 0 },
          { week: 4, waiting: 0, reviewed: 0, approved: 0 },
        ]);
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
        for (const user of usersSnap.docs) {
          const traineeId = user.id;
          const progSnap = await getDocs(
            collection(db, "users", traineeId, "progress")
          );

          for (const d of progSnap.docs) {
            const data = d.data() as any;
            if (!data?.done) continue;
            if (data.storeId !== storeId) continue;

            let wkNumber: 1 | 2 | 3 | 4 | null = null;

            if (typeof data.week === "string") {
              wkNumber = parseInt(data.week.replace("week", "")) as any;
            }

            if (!wkNumber && data.path) {
              const wkMatch = data.path.match(/week(\d)/i);
              if (wkMatch) wkNumber = Number(wkMatch[1]) as any;
            }

            if (!wkNumber) continue;

            const bucket = tallies[wkNumber];
            bucket.reviewed += 1;
            if (data.approved) bucket.approved += 1;
            else bucket.waiting += 1;
          }
        }

        if (alive) setWeeks([tallies[1], tallies[2], tallies[3], tallies[4]]);
      } catch {
        if (alive)
          setWeeks([
            { week: 1, waiting: 0, reviewed: 0, approved: 0 },
            { week: 2, waiting: 0, reviewed: 0, approved: 0 },
            { week: 3, waiting: 0, reviewed: 0, approved: 0 },
            { week: 4, waiting: 0, reviewed: 0, approved: 0 },
          ]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    tally();
    return () => {
      alive = false;
    };
  }, [storeId]);

  const checking = resolvingStore || storeCtxLoading;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Supervisor Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Review trainee tasks and approve what’s done.
        </p>
      </header>

      {/* Week cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {weeks.map((w) => (
          <Link
            key={w.week}
            href={`/supervisor/week${w.week}`}
            className="block focus:outline-none"
          >
            <Card className="border-primary/20 hover:shadow-md transition cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Week {w.week}</CardTitle>
                <CardDescription>
                  {loading
                    ? "Loading…"
                    : `${w.waiting} task${w.waiting === 1 ? "" : "s"} pending approval`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {loading ? "—" : `${w.approved}/${w.reviewed} approved`}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Trainee list */}
      {storeId && trainees && (
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
                  <div className="font-medium">{t.traineeId}</div>
                  <div className="text-xs text-muted-foreground">
                    Tap to review
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes card */}
      {checking ? (
        <div className="rounded-xl border bg-white/60 p-4 text-sm text-gray-600">
          Checking store assignment…
        </div>
      ) : storeId ? (
        <Link
          href={`/supervisor/notes?store=${encodeURIComponent(storeId)}`}
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
      ) : (
        <div className="rounded-xl border bg-white/60 p-4 text-sm">
          <div className="font-semibold mb-1">No store assigned</div>
          <div className="text-gray-600">
            Ask an admin to assign this supervisor to a store.
          </div>
        </div>
      )}
    </div>
  );
}













