// useUserRole.ts
'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

export function useUserRole() {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const ref = doc(db, 'users', user.uid);
      let snap = await getDoc(ref);

      // Create a default profile if one doesn’t exist
      if (!snap.exists()) {
        await setDoc(ref, {
          email: user.email ?? '',
          role: 'trainer',
          createdAt: serverTimestamp(),
        });
        snap = await getDoc(ref);
      }

      setRole((snap.data()?.role as string) ?? 'trainer');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { role, loading };
}
