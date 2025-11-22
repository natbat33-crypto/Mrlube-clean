"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/useAuthUser";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Task = {
  id: string;
  order: number;
  title: string;
  type?: string;
  active?: boolean;
};

export default function Day1Page() {
  const { user } = useAuthUser();
  const uid = user?.uid;

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // load tasks + user progress
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!uid) {
        // if not signed in, show empty state (or redirect in your app)
        setTasks([]);
        setChecked({});
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // 1) tasks
        const tq = query(collection(db, "days", "day-1", "tasks"), orderBy("order", "asc"));
        const tsnap = await getDocs(tq);
        if (cancelled) return;

        const tlist: Task[] = tsnap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            order: Number(data.order ?? 0),
            title: String(data.title ?? ""),
            type: data.type,
            active: data.active,
          };
        });

        // 2) user progress
        const psnap = await getDocs(collection(db, "users", uid, "progress"));
        if (cancelled) return;

        const progressMap: Record<string, boolean> = {};
        psnap.forEach((p) => {
          const pd = p.data() as any;
          progressMap[p.id] = !!pd.done;
        });

        // init checked state (default false unless progress says true)
        const init: Record<string, boolean> = {};
        tlist.forEach((t) => (init[t.id] = !!progressMap[t.id]));

        if (!cancelled) {
          setTasks(tlist);
          setChecked(init);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const completed = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);
  const total = tasks.length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  // toggle + save to Firestore
  async function toggleTask(taskId: string) {
    if (!uid) return; // guard
    const next = !checked[taskId];

    // optimistically update UI
    setChecked((prev) => ({ ...prev, [taskId]: next }));

    // write to users/{uid}/progress/{taskId}
    await setDoc(
      doc(db, "users", uid, "progress", taskId),
      {
        done: next,
        completedAt: next ? serverTimestamp() : null,
        dayId: "day-1",
      },
      { merge: true }
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Day 1 — Safety Fundamentals</h1>
        <p className="text-sm text-muted-foreground">Onboarding &amp; Safety</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Progress</CardTitle>
          <CardDescription>{completed}/{total} tasks completed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm mb-2">
            <span>Overall</span>
            <span className="font-semibold">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {/* tasks */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground">No tasks found for Day 1.</div>
        ) : (
          tasks.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-3 rounded-2xl border p-4 cursor-pointer"
            >
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={!!checked[t.id]}
                onChange={() => toggleTask(t.id)}
              />
              <span className="font-medium">
                {t.order}. {t.title}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
