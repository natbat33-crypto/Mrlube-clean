
"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

type Props = {
  traineeId: string;           // Firestore user doc id (fallback)
  traineeUid?: string | null;  // Auth UID (preferred)
};

const YELLOW = "#FFC20E";

type TaskRow = { id: string; title: string };

const slug = (s?: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** ---- Fetch Week tasks robustly (supports modules with week==n or weeks/week-n/tasks) ---- */
async function fetchWeekTasksAll(n: 1 | 2 | 3 | 4): Promise<TaskRow[]> {
  const out = new Map<string, TaskRow>();

  // A) modules where week == n
  try {
    const mods = await getDocs(query(collection(db, "modules"), where("week", "==", n)));
    if (!mods.empty) {
      for (const md of mods.docs) {
        const ts = await getDocs(collection(db, "modules", md.id, "tasks"));
        ts.forEach((d) => {
          const v: any = d.data();
          out.set(d.id, { id: d.id, title: v?.title || d.id });
        });
      }
    }
  } catch {
    // ignore
  }

  // B) conventional week collections (avoid tuple spread by joining the path)
  if (out.size === 0) {
    const paths = [
      ["weeks", `week-${n}`, "tasks"],
      ["weeks", `week${n}`, "tasks"],
      ["modules", `week-${n}`, "tasks"],
      ["modules", `week${n}`, "tasks"],
    ];
    for (const p of paths) {
      try {
        const snap = await getDocs(collection(db, p.join("/")));
        if (!snap.empty) {
          snap.forEach((d) => {
            const v: any = d.data();
            out.set(d.id, { id: d.id, title: v?.title || d.id });
          });
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  return Array.from(out.values());
}

/** Count “done” across a catalog using id OR title-slug matches */
function countDoneAgainstCatalog(
  progressDocs: Array<{ id: string; data: any }>,
  idSet: Set<string>,
  slugSet: Set<string>,
) {
  let count = 0;
  for (const d of progressDocs) {
    const p = d.data || {};
    const isDone =
      p.done === true ||
      p.completed === true ||
      p.status === "done" ||
      typeof p.done === "undefined"; // lenient for legacy rows

    if (!isDone) continue;

    const candidates = [
      d.id,
      String(p.taskId || p.taskID || ""),
      slug(p.title || ""),
    ].filter(Boolean);

    const hit =
      candidates.some((k) => idSet.has(k)) ||
      candidates.some((k) => slugSet.has(k));

    if (hit) count += 1;
  }
  return count;
}

export default function StoreOverallProgress({ traineeId, traineeUid }: Props) {
  // Prefer UID; fall back to doc id
  const uidKey = useMemo(() => (traineeUid ? String(traineeUid) : null), [traineeUid]);
  const docKey = useMemo(() => String(traineeId), [traineeId]);

  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const unsubs: Array<() => void> = [];

    (async () => {
      setLoading(true);

      // 1) Build unified Week 1–4 catalog
      const [w1, w2, w3, w4] = await Promise.all([
        fetchWeekTasksAll(1),
        fetchWeekTasksAll(2),
        fetchWeekTasksAll(3),
        fetchWeekTasksAll(4),
      ]);

      const idSet = new Set<string>();
      const slugSet = new Set<string>();
      [w1, w2, w3, w4].forEach((rows) =>
        rows.forEach((r) => {
          idSet.add(r.id);
          slugSet.add(slug(r.title));
        }),
      );

      const totalTasks = idSet.size;
      if (!alive) return;
      setTotal(totalTasks);

      // No tasks? stop loading cleanly
      if (totalTasks === 0) {
        setDone(0);
        setLoading(false);
        return;
      }

      // Helpers
      const readOnce = async (pathKey: string) => {
        const snap = await getDocs(collection(db, "users", pathKey, "progress"));
        return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      };
      const listenPath = (pathKey: string, apply: (docs: Array<{ id: string; data: any }>) => void) => {
        const unsub = onSnapshot(collection(db, "users", pathKey, "progress"), (snap) => {
          apply(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        });
        unsubs.push(unsub);
      };

      // 2) Initial read (uid + docId), then show something immediately
      let initialDocs: Array<{ id: string; data: any }> = [];
      try {
        if (uidKey) initialDocs = initialDocs.concat(await readOnce(uidKey));
        if (!uidKey || uidKey !== docKey) initialDocs = initialDocs.concat(await readOnce(docKey));
      } catch {
        // ignore; we still attach live listeners
      }
      if (!alive) return;
      setDone(countDoneAgainstCatalog(initialDocs, idSet, slugSet));
      setLoading(false);

      // 3) Live updates (merge uid & docId)
      let lastA: Array<{ id: string; data: any }> = [];
      let lastB: Array<{ id: string; data: any }> = [];
      const recompute = () => {
        if (!alive) return;
        const byId = new Map<string, { id: string; data: any }>();
        [...lastA, ...lastB].forEach((row) => byId.set(row.id, row));
        setDone(countDoneAgainstCatalog(Array.from(byId.values()), idSet, slugSet));
      };

      if (uidKey) listenPath(uidKey, (docs) => { lastA = docs; recompute(); });
      if (!uidKey || uidKey !== docKey) listenPath(docKey, (docs) => { lastB = docs; recompute(); });
    })();

    return () => {
      alive = false;
      unsubs.forEach((u) => { try { u(); } catch {} });
    };
  }, [uidKey, docKey]);

  // --- UI ---
  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-40 h-2 bg-gray-200 rounded overflow-hidden">
          <div className="h-full bg-gray-300 animate-pulse" style={{ width: "50%" }} />
        </div>
        <span className="text-xs text-gray-400">…</span>
      </div>
    );
  }

  if (total === 0) {
    return <span className="text-xs text-gray-500">No week tasks</span>;
  }

  const pct = Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="w-40 h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${pct}%`, backgroundColor: YELLOW }}
          aria-label={`Progress ${pct}%`}
        />
      </div>
      <span className="text-xs text-gray-700">
        {pct}% <span className="text-gray-400">({done}/{total})</span>
      </span>
    </div>
  );
}
