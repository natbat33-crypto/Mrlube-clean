"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
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
} from "firebase/firestore";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

/* ============================
   types
============================ */
type TaskMeta = { id: string; title?: string; order?: number; sort_order?: number };

type ProgDoc = {
  id: string;
  path?: string;
  done?: boolean;
  approved?: boolean;
  completedAt?: any;
  approvedAt?: any;
  traineeId?: string;
  storeId?: string;
  week?: string;
};

/* ============================
   resolve store
============================ */
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

/* ============================
   Extract task key
============================ */
function getTaskKey(p: ProgDoc): string {
  if (p.path) {
    const last = p.path.split("/").pop() || "";
    if (last) return last;
  }
  if (p.id) {
    const parts = p.id.split("__");
    const tail = parts[parts.length - 1];
    return tail || p.id;
  }
  return "";
}

/* ============================
   Fetch progress docs
============================ */
async function fetchProgressForWeek1(storeId: string) {
  const traineesSnap = await getDocs(collection(db, "stores", storeId, "trainees"));
  const allowed: string[] = [];

  traineesSnap.forEach((d) => {
    const data = d.data() as any;
    // 🚨 PILOT FIX — allow ALL active trainees in store
    if (data.active) {
      allowed.push(d.id);
    }
  });

  if (allowed.length === 0) {
    return { level: "no-trainees", docs: [] };
  }

  const docs: ProgDoc[] = [];

  for (const traineeId of allowed) {
    const progCol = collection(db, "users", traineeId, "progress");
    const q = query(
      progCol,
      where("week", "==", "week1"),
      where("done", "==", true),
      where("storeId", "==", storeId)
    );

    const snap = await getDocs(q);
    snap.forEach((d) => {
      docs.push({
        id: d.id,
        traineeId,
        ...(d.data() as any),
      });
    });
  }

  return { level: "found", docs };
}

/* ============================
   Page
============================ */
export default function SupervisorWeek1Page() {
  const [storeId, setStoreId] = useState("");
  const [tasksById, setTasksById] = useState<Record<string, TaskMeta>>({});
  const [items, setItems] = useState<ProgDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // 📌 resolve store first
        const sid = await resolveStoreId();
        if (!alive) return;
        setStoreId(sid);

        if (!sid) {
          setItems([]);
          return;
        }

        // 📌 load task metadata
        const taskSnap = await getDocs(collection(db, "modules", "week1", "tasks"));
        const byId: Record<string, TaskMeta> = {};

        taskSnap.docs.forEach((d) => {
          byId[d.id] = { id: d.id, ...(d.data() as any) };
        });

        if (!alive) return;
        setTasksById(byId);

        // 📌 load trainee progress
        const { docs } = await fetchProgressForWeek1(sid);

        let data = docs.filter((d) => d.week === "week1" && d.storeId === sid && d.done);

        // 📌 sort properly
        data.sort((a, b) => {
          const keyA = getTaskKey(a);
          const keyB = getTaskKey(b);

          const ta = byId[keyA];
          const tb = byId[keyB];

          const oa = ta?.order ?? ta?.sort_order ?? 9999;
          const ob = tb?.order ?? tb?.sort_order ?? 9999;

          return oa !== ob ? oa - ob : keyA.localeCompare(keyB);
        });

        if (!alive) return;
        setItems(data);
      } catch (err) {
        console.error("[Week1] error:", err);
        if (!alive) return;
        setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- computed ---------- */
  const reviewed = items.length;
  const approved = items.filter((i) => i.approved).length;
  const waiting = items.filter((i) => i.done && !i.approved).length;
  const pct = reviewed ? Math.round((approved / reviewed) * 100) : 0;

  /* ---------- approve toggle ---------- */
  async function setApproved(p: ProgDoc, next: boolean) {
    setItems((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, approved: next } : x))
    );

    try {
      if (!storeId) throw new Error("Missing storeId");
      if (!p.traineeId) throw new Error("Missing traineeId");

      const ref = doc(db, "users", p.traineeId, "progress", p.id);

      await setDoc(
        ref,
        {
          approved: next,
          approvedAt: next ? serverTimestamp() : deleteField(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error("approve error:", e);
      setItems((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, approved: !next } : x))
      );
      alert("Approval failed — check rules or assignment.");
    }
  }

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

        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{waiting}</span> waiting •{" "}
              <span className="font-medium">{approved}</span> approved •{" "}
              <span className="font-medium">{pct}%</span> approved
            </div>

            <div className="ml-auto min-w-[220px]">
              <div className="flex justify-between text-xs mb-1">
                <span>Approved</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed tasks for your trainees yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((p) => {
                const key = getTaskKey(p);
                const meta = tasksById[key];
                const title = meta?.title || key;
                const order = meta?.order ?? meta?.sort_order;

                return (
                  <li
                    key={p.id + "_" + p.traineeId}
                    className="flex items-center justify-between border rounded-md p-3 bg-white"
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




