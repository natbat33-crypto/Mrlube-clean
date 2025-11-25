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

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // Load all stores sorted by store number
        const qy = query(collection(db, "stores"), orderBy("number", "asc"));
        const snap = await getDocs(qy);

        const list: Store[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));

        if (!alive) return;
        setStores(list);

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
              <div className="text-sm line-clamp-2">{s.address}</div>
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
    </main>
  );
}
