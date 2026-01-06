// app/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      router.replace(user ? '/dashboard' : '/auth/login');
    });
    return () => unsub();
  }, [router]);

  // Safe-area wrapper prevents iOS first-render hitbox issues
  return <div className="safe-area" />;
}

