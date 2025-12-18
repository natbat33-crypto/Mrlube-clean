"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
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
  onSnapshot,
} from "firebase/firestore";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

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
   Get task key
============================================ */
function getTaskKey(p: ProgDoc): string {
  if (p.path) {
    const last = p.path.split("/").pop();
    if (last) return last;
  }
  const parts = p.id.split("__");
  return parts[parts.length - 1] || p.id;
}

/* ============================================
   MAIN
============================================ */
export default function SupervisorWeek1Page() {
  const [storeId, setStoreId] = useState("");
  const [tasksById, setTasksById] = useState<Record<string, TaskMeta>>({});
  const [items, setItems] = useState<ProgDoc[]>([]);
  const [loading, setLoading] = useState(true);

  /* --------------------------------------------
     LOAD STORE + TASKS + PROGRESS
  -------------------------------------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const sid = await resolveStoreId();
        if (!alive) return;
        setStoreId(sid);

        if (!sid) {
          setItems([]);
          return;
        }

        const taskSnap = await getDocs(
          collection(db, "modules", "week1", "tasks")
        );

        const byId: Record<string, TaskMeta> = {};
        taskSnap.docs.forEach((d) => {
          byId[d.id] = { id: d.id, ...(d.data() as any) };
        });
        setTasksById(byId);

        // 🔒 LIVE progress listener (authority)
        const traineesSnap = await getDocs(
          collection(db, "stores", sid, "trainees")
        );

        const traineeIds = traineesSnap.docs
          .filter((d) => d.data()?.active === true)
          .map((d) => d.id);

        const all: ProgDoc[] = [];

        for (const traineeId of traineeIds) {
          const q = query(
            collection(db, "users", traineeId, "progress"),
            where("week", "==", "week1"),
            where("done", "==", true),
            where("storeId", "==", sid)
          );

          const snap = await getDocs(q);
          snap.forEach((d) =>
            all.push({ id: d.id, traineeId, ...(d.data() as any) })
          );
        }

        all.sort((a, b) => {
          const ta = tasksById[getTaskKey(a)];
          const tb = tasksById[getTaskKey(b)];
          const oa = ta?.order ?? ta?.sort_order ?? 9999;
          const ob = tb?.order ?? tb?.sort_order ?? 9999;
          return oa - ob;
        });

        if (alive) setItems(all);
      } catch (e) {
        console.error("[Week1 supervisor] load error:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* --------------------------------------------
     ⭐ AUTHORITATIVE SECTION ENFORCEMENT
     (THIS IS THE FIX)
  -------------------------------------------- */
  useEffect(() => {
    if (items.length === 0) return;

    const byTrainee: Record<string, ProgDoc[]> = {};

    items.forEach((p) => {
      if (!p.traineeId) return;
      byTrainee[p.traineeId] ||= [];
      byTrainee[p.traineeId].push(p);
    });

    Object.entries(byTrainee).forEach(([traineeId, docs]) => {
      const allApproved =
        docs.length > 0 && docs.every((d) => d.approved === true);

      setDoc(
        doc(db, "users", traineeId, "sections", "week1"),
        {
          approved: allApproved,
          approvedAt: allApproved ? serverTimestamp() : deleteField(),
        },
        { merge: true }
      ).catch(console.error);
    });
  }, [items]);

  /* --------------------------------------------
     TOGGLE TASK APPROVAL
  -------------------------------------------- */
  async function setApproved(p: ProgDoc, next: boolean) {
    if (!p.traineeId) return;

    setItems((prev) =>
      prev.map((x) =>
        x.id === p.id ? { ...x, approved: next } : x
      )
    );

    await setDoc(
      doc(db, "users", p.traineeId, "progress", p.id),
      {
        approved: next,
        approvedAt: next ? serverTimestamp() : deleteField(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  /* --------------------------------------------
     UI DERIVED
  -------------------------------------------- */
  const reviewed = items.length;
  const approved = items.filter((i) => i.approved).length;
  const pct = reviewed ? Math.round((approved / reviewed) * 100) : 0;

  /* --------------------------------------------
     RENDER
  -------------------------------------------- */
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
          <div className="flex justify-between text-sm">
            <span>{approved}/{reviewed} approved</span>
            <span>{pct}%</span>
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
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between border rounded-md p-3 bg-white"
                  >
                    <div className="font-semibold text-sm">
                      {meta?.order ? `${meta.order}. ` : ""}
                      {meta?.title ?? getTaskKey(p)}
                    </div>

                    <button
                      onClick={() => setApproved(p, !p.approved)}
                      className={`px-3 py-1.5 rounded-md text-sm border ${
                        p.approved
                          ? "bg-green-600 text-white"
                          : "bg-white"
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



