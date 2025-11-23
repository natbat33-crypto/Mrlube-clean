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

function pickReviewUid(): string {
  if (typeof window === "undefined") return "demo-user";
  return (
    localStorage.getItem("reviewUid") ||
    localStorage.getItem("uid") ||
    "demo-user"
  );
}

/* ---------- shared store resolver (matches week1–3 pattern) ---------- */
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
  const [resolvingStore, setResolvingStore] = useState(true);

  const { storeId: resolvedStoreId, loading: storeCtxLoading } = useStoreCtx();
  const trainees = useSupervisorTrainees(storeId);

  const searchParams = useSearchParams();
  const storeOverride = searchParams.get("store");
  const asUid = searchParams.get("as");

  /* ---------- keep ?as= override for deep review (not used in tiles) ---------- */
  useEffect(() => {
    if (asUid && asUid !== uid) setUid(asUid);
  }, [asUid, uid]);

  useEffect(() => {
    if (uid && typeof window !== "undefined") {
      localStorage.setItem("reviewUid", uid);
    }
  }, [uid]);

  /* ---------- explicit store override (?store=) ---------- */
  useEffect(() => {
    if (!storeOverride) return;
    setStoreId(String(storeOverride));
    setResolvingStore(false);
  }, [storeOverride]);

  /* ---------- if ?as=<uid>, try to read that user's storeId ---------- */
  useEffect(() => {
    if (!asUid) return;
    (async () => {
      setResolvingStore(true);
      try {
        const snap = await getDoc(doc(db, "users", asUid));
        const v: any = snap.exists() ? snap.data() : null;
        const sid = v?.storeId ?? null;
        setStoreId(sid != null ? String(sid) : null);
      } finally {
        setResolvingStore(false);
      }
    })();
  }, [asUid]);

  /* ---------- prefer provider store when no overrides ---------- */
  useEffect(() => {
    if (storeOverride || asUid) return;
    if (resolvedStoreId) {
      setStoreId(resolvedStoreId);
      setResolvingStore(false);
    }
  }, [resolvedStoreId, storeCtxLoading, storeOverride, asUid]);

  /* ---------- fallback: infer store from user/employees/supervisorUid ---------- */
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

      stopUserListener = onSnapshot(
        userRef,
        async (snap) => {
          const v: any = snap.exists() ? snap.data() : null;
          let sid: string | null =
            v?.storeId != null ? String(v.storeId) : null;

          // infer from /stores/*/employees/{uid}
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
            } catch {
              /* ignore */
            }
          }

          // infer from store.supervisorUid
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
            } catch {
              /* ignore */
            }
          }

          setStoreId(sid);
          setResolvingStore(false);
        },
        () => setResolvingStore(false)
      );
    });

    return () => {
      if (stopUserListener) stopUserListener();
      stopAuth();
    };
  }, [storeOverride, asUid, resolvedStoreId]);

  /* ---------- aggregate counts across all trainees in this store ---------- */
  useEffect(() => {
    let alive = true;

    async function tally() {
      setLoading(true);

      // ensure we have a storeId (auto connect)
      let sid = storeId;
      if (!sid) {
        sid = await resolveStoreId();
        if (!alive) return;
        if (sid) setStoreId(sid);
      }

      if (!sid) {
        if (!alive) return;
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
            const data = d.data() as {
              path?: string;
              done?: boolean;
              approved?: boolean;
              storeId?: string;
              week?: string;
            };

            if (!data?.done) continue;
            if (data.storeId !== sid) continue;

            // detect week from explicit week OR from path
            let wkNumber: 1 | 2 | 3 | 4 | null = null;

            if (typeof data.week === "string") {
              if (data.week === "week1") wkNumber = 1;
              else if (data.week === "week2") wkNumber = 2;
              else if (data.week === "week3") wkNumber = 3;
              else if (data.week === "week4") wkNumber = 4;
            }

            if (!wkNumber && data.path) {
              const wkMatch = data.path.match(/modules\/week(\d)\//i);
              if (wkMatch) {
                const n = Number(wkMatch[1]);
                if (n === 1 || n === 2 || n === 3 || n === 4) {
                  wkNumber = n as 1 | 2 | 3 | 4;
                }
              }
            }

            if (!wkNumber) continue;

            const bucket = tallies[wkNumber];
            bucket.reviewed += 1;
            if (data.approved) bucket.approved += 1;
            else bucket.waiting += 1;
          }
        }

        if (!alive) return;
        setWeeks([tallies[1], tallies[2], tallies[3], tallies[4]]);
      } catch {
        if (!alive) return;
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

      {/* Trainees list (unchanged) */}
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












