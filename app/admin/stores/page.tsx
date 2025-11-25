"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  documentId,
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
  managerId?: string | null;   // <--- FIXED (was managerUid)
};

type UserLite = {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
};

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [mgrNames, setMgrNames] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);

  const chunk = <T,>(arr: T[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
      arr.slice(i * size, i * size + size)
    );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        // 1) Load stores
        const qy = query(collection(db, "stores"), orderBy("number", "asc"));
        const snap = await getDocs(qy);

        const list: Store[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));

        if (!alive) return;
        setStores(list);

        // 2) Load manager names using store employees subcollection
        const nameMap: Record<string, UserLite> = {};

        for (const store of list) {
          if (!store.managerId) continue;

          const empRef = collection(db, "stores", store.id, "employees");
          const qemp = query(empRef, where("uid", "==", store.managerId));
          const empSnap = await getDocs(qemp);

          empSnap.forEach((e) => {
            const data = e.data() as any;
            nameMap[store.managerId!] = {
              displayName: data.displayName ?? data.name ?? null,
              name: data.name ?? null,
              email: data.email ?? null,
            };
          });
        }

        if (!alive) return;
        setMgrNames(nameMap);
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
      stores.map((s) => {
        const uinfo = s.managerId ? mgrNames[s.managerId] : undefined;

        const friendly =
          uinfo?.displayName ??
          uinfo?.name ??
          (uinfo?.email ? uinfo.email : null);

        return (
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
                <div className="text-sm line-clamp-2">{s.address}</div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Manager</span>

                  {s.managerId ? (
                    <span className="pill">{friendly ?? "Assigned"}</span>
                  ) : (
                    <span className="pill-warning">Unassigned</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      }),
    [stores, mgrNames]
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
        <div
          className="
            grid gap-4
            grid-cols-1
            sm:grid-cols-2
            lg:grid-cols-3
            xl:grid-cols-4
          "
        >
          {cards}
        </div>
      )}

      <style jsx global>{`
        .admin-stores {
          --line: #eaecef;
          --muted: #f8f9fb;
        }
        .store-card {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: #fff;
          display: flex;
          flex-direction: column;
          min-height: 150px;
        }
        .muted {
          color: #6b7280;
        }
        .pill {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--line);
          background: #fff;
          padding: 2px 8px;
          font-size: 12px;
          border-radius: 999px;
          line-height: 1;
        }
        .pill-warning {
          display: inline-flex;
          align-items: center;
          background: #fef3c7;
          color: #92400e;
          padding: 2px 8px;
          font-size: 12px;
          border-radius: 999px;
          line-height: 1;
        }
        .line-clamp-1 {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (max-width: 640px) {
          .store-card {
            border-radius: 12px;
          }
          .store-card .card-content {
            padding-top: 10px;
          }
        }
      `}</style>
    </main>
  );
}


