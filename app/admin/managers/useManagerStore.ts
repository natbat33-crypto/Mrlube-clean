// app/manager/useManagerStore.ts
"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc, getDoc, collectionGroup, query, where, limit, getDocs,
} from "firebase/firestore";
import { autoConnect } from "@/lib/autoConnect";

export type StoreDoc = {
  number: string | number;
  name?: string;
  address?: string;
};

export function useManagerStore() {
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreDoc | null>(null);

  useEffect(() => {
    let cancel = false;

    async function load() {
      const u = auth.currentUser;
      if (!u) return;

      // ensure wiring is present (employees doc, managerUids, etc.)
      await autoConnect();

      // 1) try users/{uid}.storeId
      const userRef = doc(db, "users", u.uid);
      const userSnap = await getDoc(userRef);
      let sid: string | null =
        (userSnap.exists() && (userSnap.data() as any).storeId) || null;

      // 2) fallback: membership search
      if (!sid) {
        const qEmp = query(
          collectionGroup(db, "employees"),
          where("uid", "==", u.uid),
          limit(1)
        );
        const emp = await getDocs(qEmp);
        if (!emp.empty) {
          sid = emp.docs[0].ref.parent.parent?.id || null;
        }
      }

      if (!sid) {
        if (!cancel) { setStoreId(null); setStore(null); setLoading(false); }
        return;
      }

      const sRef = doc(db, "stores", String(sid));
      const sSnap = await getDoc(sRef);
      if (!cancel) {
        setStoreId(String(sid));
        setStore(sSnap.exists() ? (sSnap.data() as StoreDoc) : null);
        setLoading(false);
      }
    }

    load().finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, []);

  return { loading, storeId, store };
}
