"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";

export function useSupervisorTrainees(storeId: string | null) {
  const [trainees, setTrainees] = useState<any[]>([]);
  const sup = auth.currentUser;

  useEffect(() => {
    if (!storeId || !sup) return;

    const qy = query(
      collection(db, "stores", storeId, "trainees"),
      where("supervisorId", "==", sup.uid),
      where("active", "==", true)
    );

    const unsub = onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setTrainees(list);
    });

    return () => unsub();
  }, [storeId, sup]);

  return trainees;
}
