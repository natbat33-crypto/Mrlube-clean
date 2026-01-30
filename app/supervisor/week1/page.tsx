"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
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
   TYPES
============================================ */
type TaskMeta = {
  id: string;
  title?: string;
  order?: number;
  sort_order?: number;
};

type ProgDoc = {
  id: string;
  done?: boolean;
  approved?: boolean;
  week?: string;
};

/* ============================================
   HELPERS
============================================ */
function getTaskKey(id: string) {
  const parts = id.split("__");
  return parts[parts.length - 1];
}

/* ============================================
   COMPONENT
============================================ */
export default function SupervisorWeek1Page() {
  const searchParams = useSearchParams();
  const traineeId = searchParams.get("as"); // ⭐ SINGLE SOURCE OF TRUTH

  const [tasksById, setTasksById] = useState<Record<string, TaskMeta>>({});
  const [items, setItems] = useState<ProgDoc[]>([]);
  const [loading, setLoading] = useState(true);

  /* ============================================
     LOAD TASKS + PROGRESS (ONLY THIS TRAINEE)
  ============================================ */
  useEffect(() => {
    if (!traineeId) return;

    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // 1️⃣ Load Week-1 tasks
        const taskSnap = await getDocs(
          collection(db, "modules", "week1", "tasks")
        );

        const byId: Record<string, TaskMeta> = {};
        taskSnap.docs.forEach((d) => {
          byId[d.id] = { id: d.id, ...(d.data() as any) };
        });
        setTasksById(byId);

        // 2️⃣ Load this trainee’s Week-1 progress
        const progSnap = await getDocs(
          query(
            collection(db, "users", traineeId, "progress"),
            where("week", "==", "week1")
          )
        );

        // 3️⃣ Filter + map (done but not yet approved)
        const data: ProgDoc[] = progSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((p) => byId[getTaskKey(p.id)])
          .filter((p) => p.done === true && p.approved !== true);

        // 4️⃣ Sort by module order
        data.sort((a, b) => {
          const ta = byId[getTaskKey(a.id)];
          const tb = byId[getTaskKey(b.id)];
          const oa = ta?.order ?? ta?.sort_order ?? 9999;
          const ob = tb?.order ?? tb?.sort_order ?? 9999;
          return oa - ob;
        });

        if (alive) setItems(data);
      } catch (e) {
        console.error("[Supervisor Week1] load error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [traineeId]);

  /* ============================================
     APPROVAL TOGGLE (FIXED)
  ============================================ */
  async function setApproved(p: ProgDoc, next: boolean) {
    if (!traineeId) return;

    // Optimistic UI update
    setItems((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, approved: next } : x))
    );

    // Save approval on task
    await setDoc(
      doc(db, "users", traineeId, "progress", p.id),
      {
        approved: next,
        approvedAt: next ? serverTimestamp() : deleteField(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // ✅ NEW: if this was the LAST pending Week-1 task, unlock Week 2
    if (next === true) {
      const remaining = items.filter(
        (i) => i.id !== p.id && i.approved !== true
      );

      if (remaining.length === 0) {
        await setDoc(
          doc(db, "users", traineeId, "sections", "week1"),
          {
            approved: true,
            approvedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }

  /* ============================================
     UI COMPUTED
  ============================================ */
  const reviewed = items.length;
  const approved = items.filter((i) => i.approved).length;
  const waiting = reviewed - approved;
  const pct = reviewed ? Math.round((approved / reviewed) * 100) : 0;

  /* ============================================
     RENDER
  ============================================ */
  return (
    <div className="space-y-6">
      <Link
        href="/supervisor"
        className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
      >
        ← Back to Dashboard
      </Link>

      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Review — Week 1</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{waiting}</span> waiting •{" "}
              <span className="font-medium">{approved}</span> approved •{" "}
              <span className="font-medium">{pct}%</span> approved
            </div>

            <div className="ml-auto min-w-[220px]">
              <div className="flex justify-between text-xs mb-1">
                <span>Approved</span>
                <span className="text-black">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed tasks yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((p) => {
                const key = getTaskKey(p.id);
                const meta = tasksById[key];
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white"
                  >
                    <div className="font-semibold text-sm break-words">
                      {meta?.order ? `${meta.order}. ` : ""}
                      {meta?.title}
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
