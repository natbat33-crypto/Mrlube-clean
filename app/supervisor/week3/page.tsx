// app/supervisor/week3/page.tsx
"use client";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

/* ---------- types ---------- */
type TaskMeta = { id: string; title?: string; order?: number; sort_order?: number };

type ProgDoc = {
  id: string;            // users/{traineeId}/progress/{progressId}
  path?: string;         // "modules/week3/tasks/<taskId>"
  done?: boolean;
  approved?: boolean;
  completedAt?: any;
  approvedAt?: any;
  traineeId?: string;
  traineeName?: string | null;
  storeId?: string;
  week?: string;
};

/* ---------- store resolver (same as week1/2) ---------- */
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

/* ---------- progress fetch from users/{uid}/progress (assigned trainees only) ---------- */
async function fetchProgressForWeek3(storeId: string, supervisorUid: string) {
  // 1) find trainees assigned to this supervisor in this store
  const assignedSnap = await getDocs(collection(db, "stores", storeId, "trainees"));
  const traineeIds: string[] = [];

  assignedSnap.forEach((d) => {
    const data = d.data() as any;
    if (data.active && data.supervisorId === supervisorUid) {
      traineeIds.push(d.id); // traineeUid
    }
  });

  if (traineeIds.length === 0) {
    return { level: "no-trainees", docs: [] as ProgDoc[] };
  }

  // 2) build map of user names
  const userMap = new Map<string, { name?: string; displayName?: string }>();
  const usersSnap = await getDocs(collection(db, "users"));
  usersSnap.forEach((u) => {
    const d = u.data() as any;
    userMap.set(u.id, { name: d.name, displayName: d.displayName });
  });

  // 3) for each assigned trainee, load their week3 completed tasks for this store
  const docs: ProgDoc[] = [];
  for (const traineeId of traineeIds) {
    const progCol = collection(db, "users", traineeId, "progress");
    const qy = query(
      progCol,
      where("week", "==", "week3"),
      where("done", "==", true),
      where("storeId", "==", storeId)
    );
    const snap = await getDocs(qy);

    const nameInfo = userMap.get(traineeId);
    const traineeName = nameInfo?.name || nameInfo?.displayName || null;

    snap.forEach((d) => {
      docs.push({
        id: d.id,
        traineeId,
        traineeName,
        ...(d.data() as any),
      } as ProgDoc);
    });
  }

  return { level: "assigned-trainees", docs };
}

/* ---------- page ---------- */
export default function SupervisorWeek3Page() {
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

        // task metadata for week3
        const taskSnap = await getDocs(collection(db, "modules", "week3", "tasks"));
        const byId: Record<string, TaskMeta> = {};
        taskSnap.docs.forEach((d) => {
          byId[d.id] = { id: d.id, ...(d.data() as any) };
        });
        if (!alive) return;
        setTasksById(byId);

        // trainee progress docs for this store + week3 + done (assigned trainees only)
        const sup = auth.currentUser;
        const supervisorUid = sup?.uid || "";
        const { level, docs } = await fetchProgressForWeek3(sid, supervisorUid);

        let data = docs.filter(
          (d) => d.week === "week3" && d.storeId === sid && d.done
        );

        // sort by configured order then task id
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
        setDebugInfo({ level, total: data.length });
      } catch (e) {
        if (!alive) return;
        console.error("[Supervisor Week3] load error:", e);
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

  /* ---------- Approve/Undo toggle (writes to trainee’s doc by id) ---------- */
  async function setApproved(p: ProgDoc, next: boolean) {
    // optimistic UI
    setItems((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, approved: next } : x))
    );

    try {
      if (!storeId) throw new Error("No store found for your account.");
      if (!p.traineeId) throw new Error("Missing traineeId on progress doc.");
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
      // revert on failure
      setItems((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, approved: !next } : x))
      );
      alert("Failed to update approval. Check Firestore rules/assignment.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/supervisor"
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm bg-white hover:bg-muted transition"
        >
          <span aria-hidden>←</span> Back to Dashboard
        </Link>
        {debugInfo && (
          <div className="text-xs text-muted-foreground">
            Debug: store <b>{storeId || "—"}</b> • docs <b>{debugInfo.total}</b> • query{" "}
            <b>{debugInfo.level}</b>
          </div>
        )}
      </div>

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle>Review — Week 3</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-6">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{waiting}</span> waiting •{" "}
              <span className="font-medium">{approved}</span> approved •{" "}
              <span className="font-medium">{pct}%</span> approved
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
                const traineeLabel = p.traineeName || "Trainee";

                return (
                  <li
                    key={p.id + (p.traineeId || "")}
                    className="flex items-center justify-between gap-3 border rounded-md p-3 bg-white"
                  >
                    <div className="min-w-0 font-semibold text-sm break-words">
                      {order ? `${order}. ` : ""}
                      {title}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({traineeLabel})
                      </span>
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


