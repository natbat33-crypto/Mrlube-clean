"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/useAuthUser";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

type Task = { id: string; title: string; sort_order?: number; moduleId: string };
type Prog = { done?: boolean; updatedAt?: any };

export default function TrainingWeek1Page() {
  const router = useRouter();
  const { user } = useAuthUser();
  const uid = user?.uid;

  const [loading, setLoading] = useState(true);
  const [moduleTitle, setModuleTitle] = useState("Week 1");
  const [moduleDesc, setModuleDesc] = useState<string | undefined>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<Record<string, Prog>>({});

  useEffect(() => {
    let unsub: undefined | (() => void);

    (async () => {
      if (!uid) return; // must be signed in
      setLoading(true);

      // Find the Week 1 module
      const modSnap = await getDocs(
        query(collection(db, "modules"), where("week", "==", 1))
      );
      if (modSnap.empty) {
        setModuleTitle("Week 1 (not seeded)");
        setTasks([]);
        setLoading(false);
        return;
      }
      const mod = modSnap.docs[0];
      const moduleId = mod.id;
      setModuleTitle(mod.data().title || "Week 1");
      setModuleDesc(mod.data().description);

      // Load tasks (NO orderBy -> avoid index). Sort in JS.
      const tSnap = await getDocs(
        query(collection(db, "tasks"), where("moduleId", "==", moduleId))
      );
      const list: Task[] = tSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setTasks(list);

      // Live progress for this user
      unsub = onSnapshot(collection(db, "users", uid, "progress"), (snap) => {
        const map: Record<string, Prog> = {};
        snap.forEach((d) => (map[d.id] = d.data() as any));
        setProgress(map);
      });

      setLoading(false);
    })();

    return () => unsub?.();
  }, [uid]);

  async function toggleTask(taskId: string, checked: boolean) {
    if (!uid) return;
    await setDoc(
      doc(db, "users", uid, "progress", taskId),
      { done: checked, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  const doneCount = useMemo(
    () => tasks.filter((t) => progress[t.id]?.done).length,
    [tasks, progress]
  );
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  if (!uid) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-extrabold text-[#0b3d91]">My Training</h1>
        <p className="text-slate-600 mt-1">Please log in to see your training.</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex items-center gap-2 rounded-lg border border-[#0b3d91]/20 text-[#0b3d91] hover:bg-[#0b3d91]/5 px-3 py-1.5"
        >
          ← Back to Dashboard
        </button>
        <span className="text-slate-500">Training</span>
        <span className="text-slate-400">›</span>
        <strong>Week 1</strong>
      </div>

      <h1 className="text-3xl font-extrabold text-[#0b3d91]">{moduleTitle}</h1>
      {moduleDesc && <p className="text-slate-600 mt-1">{moduleDesc}</p>}

      {/* Progress */}
      <div className="mt-6 rounded-xl border bg-white shadow-sm p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Progress</div>
          <div className="inline-flex items-center gap-2 text-sm font-bold text-[#0b3d91]">
            {pct}%{" "}
            <span className="ml-2 inline-flex items-center rounded-full bg-[#f2b705] text-[#1b1b1b] px-2 py-0.5 text-[11px]">
              {doneCount}/{tasks.length}
            </span>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-[#0b3d91]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 text-slate-600 text-sm">
          {doneCount}/{tasks.length} tasks completed
        </div>
      </div>

      {/* Tasks */}
      <div className="mt-6 space-y-3">
        {loading && <p className="text-slate-600">Loading…</p>}
        {!loading &&
          tasks.map((t) => {
            const checked = !!progress[t.id]?.done;
            return (
              <label
                key={t.id}
                className={`flex items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors ${
                  checked ? "bg-[#fff9db] border-[#f2b705]" : "bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-slate-300 text-[#0b3d91] focus:ring-[#0b3d91]"
                  checked={checked}
                  onChange={(e) => toggleTask(t.id, e.target.checked)}
                />
                <span className={`text-[15px] ${checked ? "line-through text-slate-500" : ""}`}>
                  {t.sort_order}. {t.title}
                </span>
              </label>
            );
          })}
        {!loading && tasks.length === 0 && <p className="text-slate-600">No tasks found for Week 1.</p>}
      </div>
    </main>
  );
}
