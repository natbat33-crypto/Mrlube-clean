// app/admin/stores/[id]/page.tsx
import Link from "next/link";
import { adminDb } from "@/lib/firebase-admin";

interface StorePageProps {
  params: { id: string };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type StoreDoc = {
  number: number;
  name: string;
  address: string;
};

type AnyDoc = Record<string, any>;

type Trainee = {
  id: string;
  uid: string;
  name: string;
  pct: number;
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function resolveUserLabel(uid?: string | null): Promise<string | null> {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  const u = snap.exists ? (snap.data() as AnyDoc) : null;
  return u?.displayName || u?.name || u?.email || null;
}

async function getProgramTotalTasks(): Promise<number> {
  let total = 0;

  const modulesSnap = await adminDb.collection("modules").get();
  for (const mod of modulesSnap.docs) {
    const tasksSnap = await mod.ref.collection("tasks").get();
    tasksSnap.forEach((t) => {
      const d = t.data() as AnyDoc;
      if (d.active !== false) total += 1;
    });
  }

  const daysSnap = await adminDb.collection("days").get();
  for (const day of daysSnap.docs) {
    const tasksSnap = await day.ref.collection("tasks").get();
    tasksSnap.forEach((t) => {
      const d = t.data() as AnyDoc;
      if (d.active !== false) total += 1;
    });
  }

  return total;
}

async function getTraineeCompletedTasks(uid: string): Promise<number> {
  const snaps = await adminDb
    .collection("users")
    .doc(uid)
    .collection("progress")
    .get();

  let completed = 0;
  snaps.forEach((doc) => {
    const d = doc.data() as AnyDoc;
    if (d.done || d.approved || d.completed) completed += 1;
  });

  return completed;
}

async function getTraineePercent(uid: string, total: number): Promise<number> {
  if (!total) return 0;
  const completed = await getTraineeCompletedTasks(uid);
  return clamp((completed / total) * 100);
}

export default async function StorePage({ params }: StorePageProps) {
  const storeId = params.id;
  const storeRef = adminDb.collection("stores").doc(storeId);

  const storeSnap = await storeRef.get();
  if (!storeSnap.exists) {
    return <main className="p-6">Store not found</main>;
  }

  const store = storeSnap.data() as StoreDoc;

  /* ================= Trainees ================= */
  const traineesSnap = await storeRef.collection("trainees").get();
  const totalTasks = await getProgramTotalTasks();

  const trainees: Trainee[] = await Promise.all(
    traineesSnap.docs.map(async (row, i) => {
      const data = row.data() as AnyDoc;
      const uid: string = data.traineeId || row.id;

      const name =
        data.displayName ||
        (await resolveUserLabel(uid)) ||
        `Trainee ${i + 1}`;

      const pct = uid ? await getTraineePercent(uid, totalTasks) : 0;

      return { id: row.id, uid, name, pct };
    })
  );

  trainees.sort((a, b) => a.name.localeCompare(b.name));

  /* ================= UI ================= */
  return (
    <main className="mx-auto max-w-4xl p-4 lg:p-6 space-y-6">
      {/* Store Header */}
      <div className="rounded-xl border bg-white p-5">
        <h1 className="text-xl font-semibold">Store #{store.number}</h1>
        <p className="text-sm text-muted-foreground">{store.name}</p>
        <p className="mt-1 text-sm">{store.address}</p>

        {/* Store Users */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Store Users</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage roles and access for this store.
          </p>
          <Link
            href={`/admin/stores/${storeId}/users`}
            className="inline-flex mt-3 rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Manage users →
          </Link>
        </section>

        {/* Trainees */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Trainees</h2>

          {!trainees.length ? (
            <p className="text-sm text-muted-foreground mt-1">
              No trainees found.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {trainees.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/trainees/${t.uid}?store=${storeId}`}
                    className="block rounded-lg border p-4 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium truncate">
                        {t.name}
                      </span>
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {t.pct}%
                      </span>
                    </div>

                    <div className="mt-3 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${t.pct}%` }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Notes */}
      <div className="rounded-xl border bg-white p-5">
        <h2 className="text-sm font-semibold">Notes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          View messages from the manager and reply.
        </p>
        <Link
          href={`/admin/stores/notes?store=${storeId}`}
          className="inline-flex mt-3 rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Open notes →
        </Link>
      </div>

      {/* Back */}
      <Link
        href="/admin/stores"
        className="inline-flex rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        ← Back to Stores
      </Link>
    </main>
  );
}
