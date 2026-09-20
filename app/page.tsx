// app/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    const startAuth = async () => {
      // Wait for Firebase to finish restoring the saved login
      await auth.authStateReady();

      if (cancelled) return;

      unsub = onAuthStateChanged(auth, async (user) => {
        if (cancelled) return;

        if (!user) {
          router.replace('/auth/login');
          return;
        }

        // 🔥 CHECK IF USER IS ACTIVE
        const snap = await getDoc(doc(db, 'users', user.uid));

        if (cancelled) return;

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
      cancelled = true;

      if (unsub) {
        unsub();
      }
    };
  }, [router]);

  return <div className="safe-area" />;
}