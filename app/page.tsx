// app/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db, authPersistenceReady } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    const startAuth = async () => {
      // Wait for Firebase to restore the saved login first
      await authPersistenceReady;

      unsub = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          router.replace('/auth/login');
          return;
        }

        // 🔥 CHECK IF USER IS ACTIVE
        const snap = await getDoc(doc(db, 'users', user.uid));

        if (snap.exists() && snap.data().active === false) {
          console.log('User is inactive → signing out');

          await signOut(auth);

          // Optional message (replace with your own page if you want)
          router.replace('/auth/login?disabled=1');
          return;
        }

        // If user is active → continue to dashboard
        router.replace('/dashboard');
      });
    };

    startAuth();

    return () => {
      if (unsub) unsub();
    };
  }, [router]);

  return <div className="safe-area" />;
}