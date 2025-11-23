// app/manager/stores/[id]/page.tsx
"use client";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

export default function ManagerStorePage() {
  const { id } = useParams();
  const storeId = String(id);

  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [trainees, setTrainees] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load store data
  useEffect(() => {
    async function load() {
      try {
        const ref = doc(db, "stores", storeId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setError("Store not found");
          setLoading(false);
          return;
        }
        setStore(snap.data());
      } catch (e) {
        setError("Failed loading store");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [storeId]);

  // Load trainees + employees
  useEffect(() => {
    async function loadPeople() {
      const q = query(
        collection(db, "employees"),
        where("storeId", "==", storeId)
      );
      const res = await getDocs(q);

      const all: any[] = [];
      res.forEach((d) => all.push({ id: d.id, ...d.data() }));

      setEmployees(all.filter((x) => x.role === "employee"));
      setTrainees(all.filter((x) => x.role === "trainee"));
    }
    loadPeople();
  }, [storeId]);

  if (loading) return <div className="p-6">Loading store…</div>;
  if (error)
    return <div className="p-6 text-red-600 font-semibold">{error}</div>;

  return (
    <div className="p-6 space-y-8">

      <h1 className="text-2xl font-bold mb-2">
        Store #{storeId}: {store?.name}
      </h1>

      {/* Trainees Block */}
      <Block title="Trainees">
        {trainees.length === 0 && (
          <p className="text-gray-500">No trainees found.</p>
        )}

        <div className="space-y-3">
          {trainees.map((t) => (
            <div key={t.id} className="border p-4 rounded-lg bg-gray-50">
              <div className="font-semibold">{t.name}</div>
              <Link
                href={`/supervisor/${t.id}`}
                className="text-blue-600 underline text-sm"
              >
                View trainee progress
              </Link>
            </div>
          ))}
        </div>
      </Block>

      {/* Employees Block */}
      <Block title="Employees">
        {employees.length === 0 && (
          <p className="text-gray-500">No employees found.</p>
        )}

        <div className="space-y-3">
          {employees.map((e) => (
            <div key={e.id} className="border p-4 rounded-lg bg-gray-50">
              <div className="font-semibold">{e.name}</div>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-2xl bg-white p-5">
      <div className="font-semibold mb-2">{title}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
