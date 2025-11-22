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

/* ---------- types ---------- */
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

/* ---------- store resolver ---------- */
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

/* ---------- helper: get task key from progress doc ---------- */
function getTaskKey(p: ProgDoc): string {
  if (p.path) {
    const last = p.path.split("/").pop() || "";
    if (last) return last;
  }
  if (p.id) {
    const parts = p.id.split("__");
    const tail = parts[parts.length - 1];
    if (tail) return tail;
    return p.id;
  }
  return "";
}

/* ---------- progress fetch for week1 ---------- */
async function fetchProgressForWeek1(storeId: string, supervisorUid: string) {
  const assignedSnap = await getDocs(collection(db, "stores", storeId, "trainees"));
  const allowed: string[] = [];

  assignedSnap.forEach((d) => {
    const data = d.data() as any;
    if (data.active && data.supervisorId === supervisorUid) {
      allowed.push(d.id);
    }
  });

  const docs: ProgDoc[] = [];
  if (allowed.length === 0) {
    return { level: "no-trainees", docs: [] };
  }

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
      } as ProgDoc);
    });
  }

  return { level: "assigned-trainees", docs };
}

/* ---------- page ---------- */
export default function SupervisorWeek1Page() {
  const [storeId, setStoreId] = useState("");
  const [tasksById, setTasksById] = useState<Record<string, TaskMeta>>({});
  const [items, setItems] = useState<ProgDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<{ level: string; total: number } | null>(
    null
  );

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
          setDebugInfo({ level: "no-store", total: 0 });
          return;
        }

        const taskSnap = await getDocs(collection(db, "modules", "week1", "tasks"));
        const byId: Record<string, TaskMeta> = {};
        taskSnap.docs.forEach((d) => {
          byId[d.id] = { id: d.id, ...(d.data() as any) };
        });
        if (!alive) return;
        setTasksById(byId);

        const sup = auth.currentUser;
        const supervisorUid = sup?.uid || "";
        const { level, docs } = await fetchProgressForWeek1(sid, supervisorUid);

        let data = docs.filter(
          (d) => d.week === "week1" && d.storeId === sid && d.done
        );

        data.sort((a, b) => {
          const keyA = getTaskKey(a);
          const keyB = getTaskKey(b);

          const ta = tasksById[keyA];
          const tb = tasksById[keyB];

          const oa = ta?.order ?? ta?.sort_order ?? 9999;
          const ob = tb?.order ?? tb?.sort_order ?? 9999;

          return oa !== ob ? oa - ob : keyA.localeCompare(keyB);
        });

        if (!alive) return;
        setItems(data);
        setDebugInfo({ level, total: data.length });
      } catch (e) {
        console.error("[Supervisor Week1] load error:", e);
        if (!alive) return;
        setItems([]);
        setDebugInfo({ level: "error", total: 0 });
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const reviewed = useMemo(() => items.length, [items]);
  const approved = useMemo(() => items.filter((i) => i.approved).length, [items]);
  const waiting = useMemo(() => items.filter((i) => i.done && !i.approved).length, [items]);
  const pct = reviewed ? Math.round((approved / reviewed) * 100) : 0;

  /* ---------- approve / unapprove toggle ---------- */
  async function setApproved(p: ProgDoc, next: boolean) {
    // optimistic UI
    setItems((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, approved: next } : x))
    );

    try {
      if (!storeId) throw new Error("No store found.");
      if (!p.traineeId) throw new Error("Missing traineeId.");
      if (!p.id) throw new Error("Missing progress doc id.");

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
      console.error("setApproved error:", e);
      // revert UI
      setItems((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, approved: !next } : x))
      );
      alert("Failed to update approval. Check Firestore rules/assignment.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/supervisor"
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
        >
          <span aria-hidden>←</span> Back to Dashboard
        </Link>
        {/* debugInfo kept in state for future debugging if needed */}
      </div>

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
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
                <span className="text-black">{pct}%</span>
              </div>
              <Progress value={pct} className="h-2 [&>div]:bg-yellow-400" />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed tasks for your assigned trainees yet.
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
                    key={p.id + (p.traineeId || "")}
                    className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white"
                  >
                    <div className="min-w-0 font-semibold text-sm break-words">
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




