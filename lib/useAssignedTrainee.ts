"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

/**
 * Returns ONE trainee assigned to the supervisor.
 * (Use stores/{storeId}/trainees collection with supervisorId)
 */
export function useAssignedTrainee() {
  const [traineeUid, setTraineeUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const sup = auth.currentUser;
        if (!sup) {
          if (alive) setTraineeUid(null);
          return;
        }

        // ---- 1) Get supervisor storeId from users/{uid} ----
        let storeId: string | null = null;

        try {
          const uSnap = await getDoc(doc(db, "users", sup.uid));
          if (uSnap.exists()) {
            const v = uSnap.data() as any;
            if (v?.storeId) storeId = String(v.storeId);
          }
        } catch {}

        if (!storeId) {
          if (alive) setTraineeUid(null);
          return;
        }

        // ---- 2) Find trainees assigned to this supervisor ----
        const qy = query(
          collection(db, "stores", storeId, "trainees"),
          where("supervisorId", "==", sup.uid),
          where("active", "==", true)
        );

        const snap = await getDocs(qy);

        if (!snap.empty) {
          const data = snap.docs[0].data() as any;
          const uid = String(data?.traineeId ?? snap.docs[0].id);
          if (alive) setTraineeUid(uid);
          return;
        }

        if (alive) setTraineeUid(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { traineeUid, loading };
}
