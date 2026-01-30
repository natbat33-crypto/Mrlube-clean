"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/* ============================================
   HELPERS — invariant persistence
============================================ */
function getStoredReviewUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("reviewUid");
}

/* ============================================
   Types
============================================ */
type TaskMeta = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
};

type ProgDoc = {
  id: string;
  path?: string;
  done?: boolean;
  approved?: boolean;
  traineeId?: string;
  storeId?: string;
  week?: string;
};

/* ============================================
   Resolve store for supervisor
============================================ */
async function resolveStoreId(): Promise<string> {
  const u = auth.currentUser;

  if (u) {
    const tok = await u.getIdTokenResult(true);
    if (tok?.claims?.storeId) return String(tok.claims.storeId);
  }

  if (typeof window !== "undefined") {
    const ls = localStorage.getItem("storeId");
    if (ls) return ls;
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

/* ============================================
   Get clean task key
============================================ */
function getTaskKey(p: ProgDoc): string {
  if (p.path) {
    const last = p.path.split("/").pop();
    if (last) return last;
  }

  if (p.id) {
    const parts = p.id.split("__");
    return parts[parts.length - 1];
  }

  return p.id;
}

/* ============================================
   Fetch Week 3 progress (SCOPED!)
   ONLY from users/{selectedTraineeUid}/progress
============================================ */
async function fetchProgressForWeek3(storeId: string, selectedTraineeUid: string) {
  if (!storeId || !selectedTraineeUid) return { docs: [] as ProgDoc[] };

  const q = query(
    collection(db, "users", selectedTraineeUid, "progress"),
    where("week", "==", "week3"),
    where("done", "==", true),
    where("storeId", "==", storeId)
  );

  const snap = await getDocs(q);

  const docs: ProgDoc[] = [];
  snap.forEach((d) => {
    docs.push({
      id: d.id,
      traineeId: selectedTraineeUid,
      ...(d.data() as any),
    });
  });

  return { docs };
}

/* ============================================
   MAIN COMPONENT
============================================ */
export default function SupervisorWeek3Page() {
  const searchParams = useSearchParams();

  // Your dashboard uses ?as=... as the selected trainee UID.
  // Keep that, but enforce it everywhere.
  const asParam = searchParams.get("as");
  const selectedTraineeUid = useMemo(() => {
    return (asParam ?? getStoredReviewUid() ?? "").trim();
  }, [asParam]);

  const [storeId, setStoreId] = useState("");
  const [tasksById, setTasksById] = useState<Record<string, TaskMeta>>({});
  const [items, setItems] = useState<ProgDoc[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- Load store, tasks, progress (rerun when trainee changes) ---------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // If no trainee selected, do NOT read anything.
        if (!selectedTraineeUid) {
          if (!alive) return;
          setItems([]);
          setLoading(false);
          return;
        }

        const sid = await resolveStoreId();
        if (!alive) return;
        setStoreId(sid);

        if (!sid) {
          setItems([]);
          return;
        }

        const taskSnap = await getDocs(
          collection(db, "modules", "week3", "tasks")
        );
        const byId: Record<string, TaskMeta> = {};
        taskSnap.docs.forEach((d) => {
          byId[d.id] = { id: d.id, ...(d.data() as any) };
        });
        if (!alive) return;
        setTasksById(byId);

        // ✅ THIS is the invariant:
        // supervisor reads progress ONLY from users/{selectedTraineeUid}/progress
        const { docs } = await fetchProgressForWeek3(sid, selectedTraineeUid);

        let data = docs.filter((d) => d.week === "week3" && d.done);

        data.sort((a, b) => {
          const ka = getTaskKey(a);
          const kb = getTaskKey(b);
          const oa = byId[ka]?.order ?? byId[ka]?.sort_order ?? 9999;
          const ob = byId[kb]?.order ?? byId[kb]?.sort_order ?? 9999;
          return oa - ob;
        });

        if (alive) setItems(data);
      } catch (e) {
        console.error("[Week3] load error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [selectedTraineeUid]);

  /* ---------- Section enforcement (SCOPED!) ---------- */
  useEffect(() => {
    if (!selectedTraineeUid) return;
    if (items.length === 0) return;

    const allApproved =
      items.length > 0 && items.every((d) => d.approved === true);

    setDoc(
      doc(db, "users", selectedTraineeUid, "sections", "week3"),
      {
        approved: allApproved,
        approvedAt: allApproved ? serverTimestamp() : deleteField(),
      },
      { merge: true }
    ).catch((e) => console.error("[Week3 enforce] error:", e));
  }, [items, selectedTraineeUid]);

  /* ---------- Approval toggle ---------- */
  async function setApproved(p: ProgDoc, next: boolean) {
    setItems((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, approved: next } : x))
    );

    try {
      if (!selectedTraineeUid) throw new Error("No trainee selected");

      await setDoc(
        doc(db, "users", selectedTraineeUid, "progress", p.id),
        {
          approved: next,
          approvedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Approval error:", e);
      setItems((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, approved: !next } : x))
      );
    }
  }

  const reviewed = items.length;
  const approved = items.filter((i) => i.approved).length;
  const waiting = items.filter((i) => i.done && !i.approved).length;
  const pct = reviewed ? Math.round((approved / reviewed) * 100) : 0;

  // ✅ If no trainee selected, be explicit and do NOT show anyone's data.
  if (!selectedTraineeUid) {
    return (
      <div className="space-y-6">
        <Link
          href={`/supervisor`}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
        >
          ← Back to Dashboard
        </Link>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Review — Week 3</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No trainee selected.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/supervisor?as=${selectedTraineeUid}`}
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
      >
        ← Back to Dashboard
      </Link>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Review — Week 3</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{waiting}</span> waiting •{" "}
            <span className="font-medium">{approved}</span> approved •{" "}
            <span className="font-medium">{pct}%</span> approved
          </div>

          <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed tasks yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((p) => {
                const meta = tasksById[getTaskKey(p)];
                const title = meta?.title ?? p.id;
                const order = meta?.order ?? meta?.sort_order;

                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white"
                  >
                    <div className="font-semibold text-sm break-words">
                      {order ? `${order}. ` : ""}
                      {title}
                    </div>

                    <button
                      onClick={() => setApproved(p, !p.approved)}
                      className={`px-3 py-1.5 rounded-md text-sm border transition ${
                        p.approved
                          ? "bg-green-600 text-white border-green-700 hover:bg-green-700"
                          : "bg-white border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {p.approved ? "Unapprove" : "Approve"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
