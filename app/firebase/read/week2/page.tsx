"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

type Task = {
  id: string;
  title: string;
  order: number;
  active?: boolean;
  required?: boolean;
};

export default function ReadWeek2() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, "modules", "week2", "tasks"),
          orderBy("order", "asc")
        );
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Task[];
        setTasks(data);
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (error) return <div style={{ padding: 24, color: "crimson" }}>Error: {error}</div>;

  return (
    <main style={{ padding: 24 }}>
      <h1>Week 2 – Tasks</h1>
      <ol>
        {tasks.map(t => (
          <li key={t.id}>{t.order}. {t.title}</li>
        ))}
      </ol>
      <p>Total: {tasks.length} tasks</p>
    </main>
  );
}