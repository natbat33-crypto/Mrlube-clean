"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Store = {
  id: string;
  number: number;
  name: string;
  address: string;
};

type StoreWithProgress = Store & {
  progress?: number;
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Count ALL active tasks in the program (Day1 + Weeks 1–4)
async function getProgramTotalTasks(): Promise<number> {
  let total = 0;

  try {
    const modulesSnap = await getDocs(collection(db, "modules"));
    for (const mod of modulesSnap.docs) {
      const tasksSnap = await getDocs(collection(mod.ref, "tasks"));
      tasksSnap.forEach((t) => {
        const td = t.data() as any;
        if (td.active === false) return;
        total += 1;
      });
    }
  } catch (e) {
    console.error("Error loading modules tasks for progress:", e);
  }

  try {
    const daysSnap = await getDocs(collection(db, "days"));
    for (const dayDoc of daysSnap.docs) {
      const tasksSnap = await getDocs(collection(dayDoc.ref, "tasks"));
      tasksSnap.forEach((t) => {
        const td = t.data() as any;
        if (td.active === false) return;
        total += 1;
      });
    }
  } catch (e) {
    console.error("Error loading days tasks for progress:", e);
  }

  return total;
}

// Get a single trainee's % completed
async function getTraineePercent(
  uid: string,
  programTotalTasks: number
): Promise<number> {
  if (!uid || programTotalTasks <= 0) return 0;

  try {
    const progSnap = await getDocs(
      collection(db, "users", uid, "progress")
    );

    if (progSnap.empty) return 0;

    let completed = 0;
    progSnap.forEach((doc) => {
      const d = doc.data() as any;
      if (d.done === true || d.completed === true || d.approved === true) {
        completed += 1;
      }
    });

    return clamp((completed / programTotalTasks) * 100);
  } catch (e) {
    console.error("Error loading trainee progress:", e);
    return 0;
  }
}

// 🔧 FIXED: Get store progress using users collection as source of truth
async function getStoreProgress(
  storeId: string,
  programTotalTasks: number
): Promise<number> {
  if (!storeId || programTotalTasks <= 0) return 0;

  try {
    const usersSnap = await getDocs(collection(db, "users"));

    const traineeUids: string[] = [];
    usersSnap.forEach((doc) => {
      const u = doc.data() as any;
      if (
        u.role === "trainee" &&
        u.storeId === storeId &&
        u.active !== false
      ) {
        traineeUids.push(doc.id);
      }
    });

    if (traineeUids.length === 0) return 0;

    let sum = 0;
    for (const uid of traineeUids) {
      const pct = await getTraineePercent(uid, programTotalTasks);
      sum += pct;
    }

    return clamp(sum / traineeUids.length);
  } catch (e) {
    console.error("Error computing store progress:", e);
    return 0;
  }
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const qy = query(
          collection(db, "stores"),
          orderBy("number", "asc")
        );
        const snap = await getDocs(qy);

        const baseList: Store[] = [];
        snap.forEach((d) =>
          baseList.push({ id: d.id, ...(d.data() as any) })
        );

        if (!alive) return;

        const programTotalTasks = await getProgramTotalTasks();

        const listWithProgress: StoreWithProgress[] = [];
        for (const store of baseList) {
          const progress = await getStoreProgress(
            store.id,
            programTotalTasks
          );
          listWithProgress.push({ ...store, progress });
        }

        if (!alive) return;
        setStores(listWithProgress);
      } catch (e) {
        console.error("Error loading stores:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const cards = useMemo(
    () =>
      stores.map((s) => (
        <Link key={s.id} href={`/admin/stores/${s.id}`} className="block">
          <Card className="store-card hover:shadow-sm transition">
            <CardHeader className="pb-0">
              <CardTitle className="text-[15px] font-semibold">
                Store #{s.number}
              </CardTitle>
              {s.name ? (
                <CardDescription className="muted line-clamp-1">
                  {s.name}
                </CardDescription>
              ) : null}
            </CardHeader>

            <CardContent className="pt-3">
              <div className="text-sm">{s.address}</div>

              {typeof s.progress === "number" ? (
                <div className="mt-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    Training Progress: {s.progress}%
                  </div>
                  <div className="mt-1 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${s.progress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </Link>
      )),
    [stores]
  );

  return (
    <main className="admin-stores mx-auto max-w-6xl p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stores</h1>
        <Link
          href="/admin"
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-muted"
        >
          ← Back to Dashboard
        </Link>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading stores…</div>
      ) : stores.length === 0 ? (
        <div className="text-sm text-muted-foreground">No stores found.</div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards}
        </div>
      )}
    </main>
  );
}