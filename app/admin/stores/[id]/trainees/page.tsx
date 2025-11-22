// app/admin/stores/[id]/trainees/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
} from "firebase/firestore";

type TraineeRow = { id: string; name: string; pct: number };

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function num(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function pickPct(d: Record<string, any>): number | null {
  const direct = [d.progressPct, d.progressPercent, d.percent, d.pct, d.progress];
  for (const v of direct) {
    const n = num(v);
    if (n != null) return clamp(n);
  }

  const comp =
    num(d.completed) ??
    num(d.done) ??
    (Array.isArray(d.doneIds) ? d.doneIds.length : null);
  const total =
    num(d.total) ??
    num(d.required) ??
    (Array.isArray(d.allIds) ? d.allIds.length : null);

  if (comp != null && total && total > 0) return clamp((comp / total) * 100);

  const s = d.summary || d.moduleProgress || d.modules || d.progressMap;
  if (s && typeof s === "object") {
    const c =
      num(s.completed) ??
      (Array.isArray(s.completedIds) ? s.completedIds.length : null);
    const t =
      num(s.total) ??
      num(s.required) ??
      (Array.isArray(s.allIds) ? s.allIds.length : null);
    if (c != null && t && t > 0) return clamp((c / t) * 100);
  }
  return null;
}

export default function TraineesClientPage({
  params,
}: {
  params: { id: string };
}) {
  const storeId = String(params.id);
  const [rows, setRows] = useState<TraineeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = collection(db, "stores", storeId, "trainees");
    const qy = query(base);

    const unsub = onSnapshot(qy, async (snap) => {
      const next: TraineeRow[] = [];

      for (const d of snap.docs) {
        const data = d.data() as any;
        const traineeUid: string = data.traineeId || d.id;

        // name: prefer trainee doc displayName -> users/{uid} displayName/name/email -> fallback
        let name: string =
          (typeof data.displayName === "string" && data.displayName.trim()) ||
          "";

        if (!name && traineeUid) {
          try {
            const u = await getDoc(doc(db, "users", traineeUid));
            const ud = u.exists() ? (u.data() as any) : null;
            name = ud?.displayName || ud?.name || ud?.email || "";
          } catch {
            // ignore
          }
        }
        if (!name) name = "Trainee";

        // base percent: from trainee doc if present
        let pct = pickPct(data) ?? 0;

        // 🔥 recalc from users/{uid}/progress if still 0
        if (pct === 0 && traineeUid) {
          try {
            const progSnap = await getDocs(
              collection(db, "users", traineeUid, "progress")
            );

            let done = 0;
            let total = 0;

            progSnap.forEach((p) => {
              const pd = p.data() as any;

              // If you ever store storeId in progress docs, we can add a filter later:
              // if (pd.storeId && String(pd.storeId) !== storeId) return;

              if (pd.path && typeof pd.path === "string") {
                // only count real module tasks
                if (/^modules\/week\d+\//i.test(pd.path)) {
                  total++;
                  if (pd.done) done++;
                }
              }
            });

            if (total > 0) {
              pct = clamp((done / total) * 100);
            }
          } catch {
            // ignore, keep pct as-is
          }
        }

        next.push({ id: d.id, name, pct });
      }

      next.sort((a, b) => a.name.localeCompare(b.name));
      setRows(next);
      setLoading(false);
    });

    return () => unsub();
  }, [storeId]);

  return (
    <main className="mx-auto max-w-4xl p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Store {storeId} — Trainees</h1>
        <Link
          href={`/admin/stores/${storeId}`}
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-[var(--muted,#f8f9fb)]"
        >
          ← Back to Store
        </Link>
      </div>

      <div className="rounded-xl border border-[var(--line,#eaecef)] bg-white p-5">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No trainees found for this store.
          </div>
        ) : (
          <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {rows.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-[var(--line,#eaecef)] bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm truncate">{t.name}</div>
                  <div className="ml-3 text-xs text-muted-foreground tabular-nums">
                    {t.pct}%
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${t.pct}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}


