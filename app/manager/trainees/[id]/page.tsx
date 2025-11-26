"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

/* ---------------- types ---------------- */
type TaskRow = { id: string; title: string; order: number };
type Block = {
  key: string;
  label: string;
  total: number;
  done: number;
  tasks: Array<{ id: string; title: string; done: boolean; approved: boolean }>;
};

const YELLOW = "#FFC20E";

const slug = (s?: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const orderOf = (v: any, id: string) =>
  typeof v?.order === "number"
    ? v.order
    : (() => {
        const m = /(\d+)/.exec(id);
        return m ? parseInt(m[1], 10) : 9999;
      })();

const blockSynonyms = (k: string) =>
  k === "day-1"
    ? ["day-1", "day1", "day 1", "orientation"]
    : (() => {
        const n = k.replace("week-", "");
        return [`week-${n}`, `week${n}`, `week ${n}`];
      })();

/* -------------------------------------------------------- */

export default function ManagerTraineePage({
  params,
}: {
  params: { id: string };
}) {
  const progressUid = params.id;

  const [traineeName, setTraineeName] = useState("Trainee");
  const [progressIndex, setProgressIndex] = useState<
    Record<string, { done: boolean; approved: boolean }>
  >({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>("week-1");

  /* ---------------- trainee name ---------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const snap = await getDoc(doc(db, "users", progressUid));
      if (snap.exists()) {
        const u: any = snap.data();
        if (alive) setTraineeName(u.displayName || u.email || "Trainee");
        return;
      }
    })();
    return () => {
      alive = false;
    };
  }, [progressUid]);

  /* ---------------- live progress listener ---------------- */
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "users", progressUid, "progress"),
      (snap) => {
        const idx: Record<
          string,
          { done: boolean; approved: boolean }
        > = {};

        snap.forEach((d) => {
          const p: any = d.data();
          const done =
            p.done === true ||
            p.status === "done" ||
            p.completed === true;
          const approved =
            p.approved === true ||
            !!p.approvedBy ||
            p.status === "approved";

          const tid = p.taskId || d.id;
          idx[tid] = { done, approved };
        });

        setProgressIndex(idx);
      }
    );

    return () => unsub();
  }, [progressUid]);

  /* ---------------- load task catalogs ---------------- */

  async function getFirstNonEmpty(paths: string[][]): Promise<TaskRow[]> {
    for (const path of paths) {
      try {
        if (path.length === 0) continue;
        const [p0, ...rest] = path;
        const snap = await getDocs(collection(db, p0, ...rest));
        if (!snap.empty) {
          const rows = snap.docs
            .map((d) => {
              const v: any = d.data();
              return {
                id: d.id,
                title: v?.title || d.id,
                order: orderOf(v, d.id),
              };
            })
            .sort((a, b) => a.order - b.order);
          return rows;
        }
      } catch {}
    }
    return [];
  }

  async function fetchDay1Rows(): Promise<TaskRow[]> {
    return getFirstNonEmpty([
      ["days", "day-1", "tasks"],
      ["modules", "day-1", "tasks"],
    ]);
  }

  async function fetchWeekRows(n: 1 | 2 | 3 | 4): Promise<TaskRow[]> {
    return getFirstNonEmpty([
      ["modules", `week-${n}`, "tasks"],
      ["modules", `week${n}`, "tasks"],
    ]);
  }

  function markBlock(blockKey: string, rows: TaskRow[]) {
    const tasks = rows.map(({ id, title }) => {
      const hit = progressIndex[id];
      return {
        id,
        title,
        done: hit?.done || false,
        approved: hit?.approved || false,
      };
    });

    return {
      total: tasks.length,
      done: tasks.filter((t) => t.done).length,
      tasks,
    };
  }

  /* ---------------- load blocks ---------------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const d1Rows = await fetchDay1Rows();
      const d1 = markBlock("day-1", d1Rows);

      const [w1Rows, w2Rows, w3Rows, w4Rows] = await Promise.all([
        fetchWeekRows(1),
        fetchWeekRows(2),
        fetchWeekRows(3),
        fetchWeekRows(4),
      ]);

      const blocksData: Block[] = [
        { key: "day-1", label: "Day 1", ...d1 },
        { key: "week-1", label: "Week 1", ...markBlock("week-1", w1Rows) },
        { key: "week-2", label: "Week 2", ...markBlock("week-2", w2Rows) },
        { key: "week-3", label: "Week 3", ...markBlock("week-3", w3Rows) },
        { key: "week-4", label: "Week 4", ...markBlock("week-4", w4Rows) },
      ];

      if (!alive) return;
      setBlocks(blocksData);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [progressIndex]);

  /* ---------------- overall progress ---------------- */
  const overallPct = useMemo(() => {
    const totals = blocks.reduce(
      (acc, b) => {
        acc.total += b.total;
        acc.done += b.done;
        return acc;
      },
      { total: 0, done: 0 }
    );

    if (totals.total === 0) return 0;
    return Math.round((totals.done / totals.total) * 100);
  }, [blocks]);

  /* ---------------- render ---------------- */
  return (
    <main className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{traineeName}</h1>

        <Link
          href={`/manager/stores/${encodeURIComponent(
            new URLSearchParams(
              typeof window !== "undefined" ? window.location.search : ""
            ).get("store") ?? ""
          )}`}
          className="inline-flex items-center text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
        >
          ← Back to Store
        </Link>
      </div>

      {/* OVERALL PROGRESS BAR */}
      <section className="rounded-xl border bg-white p-5">
        <div className="font-semibold mb-2">Overall Progress</div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${overallPct}%`,
                backgroundColor: YELLOW,
              }}
            />
          </div>
          <div className="text-sm font-semibold text-gray-700 shrink-0">
            {overallPct}%
          </div>
        </div>
      </section>

      {/* WEEK BLOCKS */}
      {loading ? (
        <div className="rounded-xl border bg-white/50 p-6">Loading…</div>
      ) : (
        <section className="space-y-4">
          {blocks.map((b) => {
            const pct =
              b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
            const open = openKey === b.key;

            return (
              <div
                key={b.key}
                className="rounded-xl border bg-white/50 overflow-hidden"
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="w-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{b.label}</div>
                      <button
                        onClick={() =>
                          setOpenKey(open ? null : b.key)
                        }
                        className="text-sm text-gray-600 hover:text-gray-800"
                      >
                        {open ? "Hide tasks" : "Show tasks"}
                      </button>
                    </div>

                    {/* week progress */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: YELLOW,
                          }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 shrink-0">
                        {b.done}/{b.total}
                      </div>
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="px-4 pb-4">
                    {b.tasks.length === 0 ? (
                      <div className="text-sm text-gray-600">
                        No tasks defined.
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {b.tasks.map((t, i) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between rounded border bg-white px-3 py-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`inline-block h-4 w-4 rounded-full border ${
                                  t.done
                                    ? "bg-green-600 border-green-600"
                                    : "border-gray-300 bg-white"
                                }`}
                              />
                              <span className="text-gray-700 truncate">
                                <span className="text-gray-500">
                                  {i + 1}.{" "}
                                </span>
                                {t.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2 py-0.5 border rounded-full text-xs ${
                                  t.done
                                    ? "bg-green-100 border-green-200 text-green-700"
                                    : "bg-gray-100 border-gray-200 text-gray-600"
                                }`}
                              >
                                {t.done ? "Done" : "Pending"}
                              </span>
                              <span
                                className={`px-2 py-0.5 border rounded-full text-xs ${
                                  t.approved
                                    ? "bg-green-100 border-green-200 text-green-700"
                                    : "bg-gray-100 border-gray-200 text-gray-600"
                                }`}
                              >
                                {t.approved ? "Approved" : "Not approved"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

















