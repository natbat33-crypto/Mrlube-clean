// app/manager/trainees/[id]/page.tsx
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

/** ---------------- existing types & helpers (unchanged) ---------------- **/
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
    ? ["day-1", "day1", "day 1", "orientation", "day-one"]
    : (() => {
        const n = k.replace("week-", "");
        return [`week-${n}`, `week${n}`, `week ${n}`, `wk-${n}`, `wk${n}`];
      })();

/** ---------------- component ---------------- **/
export default function ManagerTraineePage({ params }: { params: { id: string } }) {
  // Treat route param as auth UID used under users/{uid}/progress/*
  const progressUid = params.id;

  const [traineeName, setTraineeName] = useState("Trainee");
  const [progressIndex, setProgressIndex] = useState<
    Record<string, { done: boolean; approved: boolean }>
  >({});
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>("week-1");

  /** ---------- display name (unchanged) ---------- **/
  useEffect(() => {
    let alive = true;
    (async () => {
      const snap = await getDoc(doc(db, "users", progressUid));
      if (snap.exists()) {
        const u: any = snap.data();
        if (alive) setTraineeName(u.displayName || u.email || "Trainee");
        return;
      }
      const qs = await getDocs(query(collection(db, "users"), where("uid", "==", progressUid)));
      if (!alive) return;
      if (!qs.empty) {
        const u: any = qs.docs[0].data();
        setTraineeName(u.displayName || u.email || "Trainee");
      }
    })();
    return () => {
      alive = false;
    };
  }, [progressUid]);

  /** ---------- live progress listener (unchanged) ---------- **/
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users", progressUid, "progress"), (snap) => {
      const idx: Record<string, { done: boolean; approved: boolean }> = {};
      snap.forEach((d) => {
        const p: any = d.data();
        const done = p.done === true || p.status === "done" || p.completed === true;
        const approved = p.approved === true || !!p.approvedBy || p.status === "approved";
        const tid = p.taskId || p.taskID || d.id;
        const ttl = slug(p.title || "");
        const blk = slug(p.block || p.section || p.moduleId || p.week || p.day || p.dayId || "");
        idx[d.id] = { done, approved };
        if (tid) idx[tid] = { done, approved };
        if (ttl) idx[ttl] = { done, approved };
        if (blk && tid) idx[`${blk}:${tid}`] = { done, approved };
        if (blk && ttl) idx[`${blk}:${ttl}`] = { done, approved };
      });
      setProgressIndex(idx);
    });
    return () => unsub();
  }, [progressUid]);

  /** ---------- catalog fetchers (unchanged except tiny TS fix) ---------- **/
  async function getFirstNonEmpty(paths: string[][]): Promise<TaskRow[]> {
    for (const path of paths) {
      try {
        if (path.length === 0) continue; // TS-safe guard
        const [p0, ...rest] = path;
        const snap = await getDocs(collection(db, p0, ...rest));
        if (!snap.empty) {
          const rows = snap.docs.map((d) => {
            const v: any = d.data();
            return { id: d.id, title: v?.title || d.id, order: orderOf(v, d.id) };
          });
          return rows.sort((a, b) => a.order - b.order);
        }
      } catch {}
    }
    return [];
  }

  async function fetchDay1Rows(): Promise<TaskRow[]> {
    return getFirstNonEmpty([
      ["days", "day-1", "tasks"],
      ["days", "day1", "tasks"],
      ["modules", "day-1", "tasks"],
      ["modules", "orientation", "tasks"],
      ["tasks", "day-1", "tasks"],
    ]);
  }

  async function fetchWeekRows(n: 1 | 2 | 3 | 4): Promise<TaskRow[]> {
    try {
      const mods = await getDocs(query(collection(db, "modules"), where("week", "==", n)));
      if (!mods.empty) {
        let chosen =
          mods.docs.find((d) => d.id === `week-${n}`) ||
          mods.docs.find((d) => d.id === `week${n}`) ||
          mods.docs.find((d) => (d.data() as any)?.active === true) ||
          mods.docs[0];

        const ts = await getDocs(collection(db, "modules", chosen.id, "tasks"));
        const rows = ts.docs
          .map((d) => {
            const v: any = d.data();
            return { id: d.id, title: v?.title || d.id, order: orderOf(v, d.id) };
          })
          .sort((a, b) => a.order - b.order);
        return rows;
      }
    } catch {}
    return getFirstNonEmpty([
      ["modules", `week-${n}`, "tasks"],
      ["modules", `week${n}`, "tasks"],
      ["weeks", `week-${n}`, "tasks"],
      ["weeks", `week${n}`, "tasks"],
    ]);
  }

  function markBlock(blockKey: string, rows: TaskRow[]) {
    const syns = blockSynonyms(blockKey).map(slug);
    const tasks = rows.map(({ id, title }) => {
      const tSlug = slug(title);
      const keys = new Set<string>([
        id,
        tSlug,
        ...syns.map((bk) => `${bk}:${id}`),
        ...syns.map((bk) => `${bk}:${tSlug}`),
      ]);
      let done = false;
      let approved = false;
      for (const k of keys) {
        const hit = progressIndex[k];
        if (hit) {
          done = !!hit.done;
          approved = !!hit.approved;
          break;
        }
      }
      return { id, title, done, approved };
    });
    const total = tasks.length;
    const doneCount = tasks.filter((t) => t.done).length;
    return { total, done: doneCount, tasks };
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // If you’re hiding Day 1 for now, comment out these two lines:
        const d1Rows = await fetchDay1Rows();
        const d1Marked = markBlock("day-1", d1Rows);
        const day1: Block = {
          key: "day-1",
          label: "Day 1",
          total: d1Marked.total,
          done: d1Marked.done,
          tasks: d1Marked.tasks,
        };

        const [w1r, w2r, w3r, w4r] = await Promise.all([
          fetchWeekRows(1),
          fetchWeekRows(2),
          fetchWeekRows(3),
          fetchWeekRows(4),
        ]);
        const w1 = markBlock("week-1", w1r);
        const w2 = markBlock("week-2", w2r);
        const w3 = markBlock("week-3", w3r);
        const w4 = markBlock("week-4", w4r);

        if (!alive) return;
        setBlocks([
          { key: "week-1", label: "Week 1", ...w1 },
          { key: "week-2", label: "Week 2", ...w2 },
          { key: "week-3", label: "Week 3", ...w3 },
          { key: "week-4", label: "Week 4", ...w4 },
        ]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [progressIndex]);

  /** ---------------- view-only helpers (styling only) ---------------- **/
  const Pill = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
        on ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200",
      ].join(" ")}
    >
      {children}
    </span>
  );

  const StatusDot = ({ done }: { done: boolean }) => (
    <span
      className={[
        "inline-flex h-4 w-4 items-center justify-center rounded-full border",
        done ? "bg-green-600 border-green-600 text-white" : "border-gray-300 bg-white text-transparent",
      ].join(" ")}
      aria-hidden="true"
    >
      ✓
    </span>
  );

  /** ---------------- render (styling updated only) ---------------- **/
  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{traineeName}</h1>
        <Link
          href={`/manager/stores/${encodeURIComponent((new URLSearchParams(typeof window !== "undefined" ? window.location.search : "")).get("store") ?? "")}`}
          className="inline-flex items-center text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
        >
          ← Back to Store
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-white/50 p-6">Loading…</div>
      ) : (
        <section className="space-y-4">
          {blocks.map((b) => {
            const pct = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
            const open = openKey === b.key;

            return (
              <div key={b.key} className="rounded-xl border bg-white/50 overflow-hidden">
                {/* header matches trainee look/feel */}
                <div className="p-4 flex items-center justify-between">
                  <div className="w-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">{b.label}</div>
                      <button
                        onClick={() => setOpenKey(open ? null : b.key)}
                        className="text-sm text-gray-600 hover:text-gray-800"
                      >
                        {open ? "Hide tasks" : "Show tasks"}
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: YELLOW }} />
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
                      <div className="text-sm text-gray-600">No tasks defined.</div>
                    ) : (
                      <ul className="space-y-2">
                        {b.tasks.map((t, i) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between rounded border bg-white px-3 py-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <StatusDot done={t.done} />
                              <span className="text-gray-700 truncate">
                                {/* optional numbering to match trainee rows */}
                                <span className="text-gray-500">{i + 1}. </span>
                                {t.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Pill on={t.done}>{t.done ? "Done" : "Pending"}</Pill>
                              <Pill on={t.approved}>{t.approved ? "Approved" : "Not approved"}</Pill>
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


