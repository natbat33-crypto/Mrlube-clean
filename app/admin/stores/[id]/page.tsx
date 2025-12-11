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
  id: string;   // store trainee doc id
  uid: string;  // actual user uid
  name: string;
  pct: number;
};

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function resolveUserLabel(uid?: string | null) {
  if (!uid) return null;
  const snap = await adminDb.collection("users").doc(uid).get();
  const u = snap.exists ? (snap.data() as AnyDoc) : null;
  return u?.displayName || u?.name || u?.email || null;
}

async function getProgramTotalTasks(): Promise<number> {
  let total = 0;

  try {
    const modulesSnap = await adminDb.collection("modules").get();
    for (const modDoc of modulesSnap.docs) {
      const tasksSnap = await modDoc.ref.collection("tasks").get();
      tasksSnap.forEach((t) => {
        const td = t.data() as AnyDoc;
        if (td.active === false) return;
        total += 1;
      });
    }
  } catch {}

  try {
    const daysSnap = await adminDb.collection("days").get();
    for (const dayDoc of daysSnap.docs) {
      const tasksSnap = await dayDoc.ref.collection("tasks").get();
      tasksSnap.forEach((t) => {
        const td = t.data() as AnyDoc;
        if (td.active === false) return;
        total += 1;
      });
    }
  } catch {}

  return total;
}

async function getTraineeCompletedTasks(uid: string): Promise<number> {
  try {
    const snaps = await adminDb
      .collection("users")
      .doc(uid)
      .collection("progress")
      .get();

    if (snaps.empty) return 0;

    let completed = 0;
    snaps.forEach((doc) => {
      const d = doc.data() as AnyDoc;
      if (d.done === true || d.approved === true || d.completed === true) {
        completed += 1;
      }
    });

    return completed;
  } catch {
    return 0;
  }
}

async function getTraineePercent(uid: string, programTotalTasks: number) {
  if (programTotalTasks <= 0) return 0;
  const completed = await getTraineeCompletedTasks(uid);
  return clamp((completed / programTotalTasks) * 100);
}

export default async function StorePage({ params }: StorePageProps) {
  const storeId = String(params.id);
  const storeRef = adminDb.collection("stores").doc(storeId);

  const storeSnap = await storeRef.get();
  const store = storeSnap.exists ? (storeSnap.data() as StoreDoc) : undefined;
  if (!store) return <main className="p-6">Store not found</main>;

  // ---------------------------
  // Manager lookup
  // ---------------------------
  let managerLabel: string | null = null;

  const employeesSnap = await storeRef
    .collection("employees")
    .where("role", "==", "manager")
    .get();

  if (!employeesSnap.empty) {
    const mgr = employeesSnap.docs[0].data() as AnyDoc;
    managerLabel =
      mgr.displayName ||
      mgr.name ||
      mgr.email ||
      null;
  }

  // ---------------------------
  // Trainers (supervisors)
  // ---------------------------
  const trainersSnap = await storeRef
    .collection("employees")
    .where("role", "in", ["trainer", "supervisor"])
    .get();

  const trainers: string[] = await Promise.all(
    trainersSnap.docs.map(async (doc) => {
      const d = doc.data() as AnyDoc;
      const label =
        d.displayName ||
        d.name ||
        d.email ||
        (await resolveUserLabel(d.uid)) ||
        null;
      return label;
    })
  );

  trainers.sort((a, b) => a.localeCompare(b));

  // ---------------------------
  // Trainees
  // ---------------------------
  const traineesSnap = await storeRef.collection("trainees").get();
  const programTotalTasks = await getProgramTotalTasks();

  const trainees: Trainee[] = await Promise.all(
    traineesSnap.docs.map(async (row, i) => {
      const data = row.data() as AnyDoc;
      const uid: string = (data.traineeId as string) || row.id;

      const name =
        (typeof data.displayName === "string" && data.displayName.trim()) ||
        (await resolveUserLabel(uid)) ||
        `Trainee ${i + 1}`;

      let pct = 0;
      if (uid) {
        pct = await getTraineePercent(uid, programTotalTasks);
      }

      return {
        id: row.id,
        uid,
        name,
        pct: clamp(pct || 0),
      };
    })
  );

  trainees.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="mx-auto max-w-4xl p-4 lg:p-6 space-y-6">
      <div className="rounded-xl border border-[var(--line,#eaecef)] bg-white p-5">
        <h1 className="text-xl font-semibold">Store #{store.number}</h1>
        <p className="text-sm text-muted-foreground">{store.name}</p>
        <p className="mt-1 text-sm">{store.address}</p>

        {/* Manager */}
        <section className="mt-5">
          <h2 className="text-sm font-semibold">Manager</h2>
          {managerLabel ? (
            <div className="mt-1">
              <span className="inline-flex items-center rounded-full border border-[var(--line,#eaecef)] bg-white px-2 py-0.5 text-[12px]">
                {managerLabel}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Unassigned</p>
          )}
        </section>

        {/* Trainers */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Trainers</h2>

          {!trainers.length ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No trainers found for this store.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {trainers.map((t, i) => (
                <li
                  key={i}
                  className="inline-flex items-center rounded-full border border-[var(--line,#eaecef)] bg-white px-2 py-0.5 text-[12px]"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Trainees */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Trainees</h2>
          {!trainees.length ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No trainees found for this store yet.
            </p>
          ) : (
            <ul className="mt-2 grid gap-3 grid-cols-1 sm:grid-cols-2">
              {trainees.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin/trainees/${t.uid}?store=${storeId}`}
                    className="block rounded-lg border border-[var(--line,#eaecef)] bg-white p-3 hover:bg-[var(--muted,#f8f9fb)]"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm truncate">
                        {t.name}
                      </div>
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
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-[var(--line,#eaecef)] bg-white p-5">
        <h2 className="text-sm font-semibold">Notes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          View messages from the manager and reply.
        </p>
        <div className="mt-3">
          <Link
            href={`/admin/stores/notes?store=${storeId}`}
            className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-[var(--muted,#f8f9fb)]"
          >
            Open notes →
          </Link>
        </div>
      </div>

      <div>
        <Link
          href="/admin"
          className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm hover:bg-[var(--muted,#f8f9fb)]"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </main>
  );
}


