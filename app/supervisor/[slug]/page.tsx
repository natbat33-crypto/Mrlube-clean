"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/** demo → replace with auth later */
function getUid() {
  if (typeof window !== "undefined") return localStorage.getItem("uid") || "demo-user";
  return "demo-user";
}
function getReviewUid() {
  if (typeof window !== "undefined") return localStorage.getItem("reviewUid") || getUid();
  return getUid();
}

/** parse "modules/week2/tasks/t08" */
function parsePath(p: string) {
  const m = p.match(/^modules\/(week\d+)\/tasks\/([^/]+)$/i);
  return m ? { weekId: m[1], taskId: m[2] } : null;
}

type ProgressDoc = {
  path: string;             // e.g. "modules/week1/tasks/t01..."
  done?: boolean;
  completedAt?: Timestamp;
  supervisorApproved?: boolean;
};

export default function SupervisorWeekPage({
  params,
}: {
  params: { slug: string }; // "week1" | "week2" | "week3" | "week4"
}) {
  const search = useSearchParams();
  const slug = params.slug; // e.g. "week1"
  const weekNum = Number(slug.replace("week", ""));
  const reviewUid = search.get("uid") || getReviewUid();

  const [rows, setRows] = useState<
    { key: string; title: string; path: string; supervisorApproved?: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);

  // Load trainee’s completed items for THIS week and attach pretty titles
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const progCol = collection(db, "users", reviewUid, "progress");
        // only this week + must be done
        const q = query(
          progCol,
          where("done", "==", true),
          where("path", ">=", `modules/${slug}/tasks/`),
          where("path", "<",  `modules/${slug}/tasks0`) // prefix range
        );

        const snap = await getDocs(q);
        const items: { key: string; path: string; supervisorApproved?: boolean }[] =
          snap.docs.map(d => {
            const data = d.data() as ProgressDoc;
            return { key: d.id, path: data.path, supervisorApproved: data.supervisorApproved };
          });

        // Fetch task titles for each progress item
        const withTitles = await Promise.all(
          items.map(async (it) => {
            const parsed = parsePath(it.path);
            if (!parsed) return { ...it, title: it.path }; // fallback
            const tRef = doc(db, "modules", parsed.weekId, "tasks", parsed.taskId);
            const tSnap = await getDoc(tRef);
            const tData = tSnap.exists() ? (tSnap.data() as any) : null;
            const title = (tData?.title as string) || parsed.taskId;
            return { ...it, title };
          })
        );

        if (alive) setRows(withTitles);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [reviewUid, slug]);

  const reviewed = rows.length;
  const approved = rows.filter(r => r.supervisorApproved).length;
  const pct = useMemo(() => (reviewed ? Math.round((approved / reviewed) * 100) : 0), [approved, reviewed]);

  async function approve(key: string, ok: boolean) {
    // Write approval flag onto the trainee’s progress doc
    await setDoc(
      doc(db, "users", reviewUid, "progress", key),
      { supervisorApproved: ok },
      { merge: true }
    );
    setRows(prev => prev.map(r => (r.key === key ? { ...r, supervisorApproved: ok } : r)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/supervisor" className="text-sm underline">← Back to Overview</Link>

        {/* quick UID switcher (optional) */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem("uid") as HTMLInputElement);
            if (typeof window !== "undefined") localStorage.setItem("reviewUid", input.value || "");
            window.location.search = `?uid=${encodeURIComponent(input.value)}`;
          }}
        >
          <input
            name="uid"
            defaultValue={reviewUid}
            placeholder="trainee uid"
            className="text-sm border rounded px-2 py-1"
          />
          <button className="text-sm px-2 py-1 border rounded">Switch trainee</button>
        </form>
      </div>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Review — Week {weekNum}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{reviewed - approved} waiting • {approved} approved • {pct}% approved</span>
            <div className="min-w-[200px]">
              <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            </div>
          </div>

          {loading && <div className="text-sm">Loading…</div>}
          {!loading && reviewed === 0 && (
            <div className="text-sm text-muted-foreground">
              No completed tasks for this week yet.
              <div className="mt-1">Reviewing trainee: <code>{reviewUid}</code>.</div>
            </div>
          )}

          {/* Completed items (pretty titles) */}
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={r.key} className="flex items-center justify-between border rounded-lg px-3 py-2">
                <div className="font-medium">
                  {i + 1}. {r.title}
                </div>
                <div className="flex items-center gap-2">
                  {r.supervisorApproved ? (
                    <span className="text-green-700 text-xs font-semibold">Approved</span>
                  ) : (
                    <button
                      onClick={() => approve(r.key, true)}
                      className="text-xs px-2 py-1 border rounded hover:bg-accent/10"
                    >
                      Approve
                    </button>
                  )}
                  {r.supervisorApproved && (
                    <button
                      onClick={() => approve(r.key, false)}
                      className="text-xs px-2 py-1 border rounded hover:bg-accent/10"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}