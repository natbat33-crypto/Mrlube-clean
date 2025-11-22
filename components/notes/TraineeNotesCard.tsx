// components/notes/TraineeNotesCard.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export default function TraineeNotesCard() {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stop = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setStoreId(null);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        const v: any = snap.exists() ? snap.data() : null;
        setStoreId(v?.storeId ? String(v.storeId) : null);
      } finally {
        setLoading(false);
      }
    });
    return () => stop();
  }, []);

  if (loading) {
    return (
      <Card className="border-muted/40 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-primary">
            Notes from Supervisor
          </CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!storeId) {
    return (
      <Card className="border-muted/40 bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-primary">
            Notes from Supervisor
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No store assigned. Ask your manager to assign you to a store.
        </CardContent>
      </Card>
    );
  }

  return (
    <Link
      href={`/dashboard/notes?store=${encodeURIComponent(storeId)}`}
      className="block focus:outline-none"
    >
      <Card className="border-primary/30 bg-white hover:bg-primary/5 transition">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-primary">
            Notes from Supervisor
          </CardTitle>
          <CardDescription className="text-xs">
            Tap to view your messages
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Open notes
        </CardContent>
      </Card>
    </Link>
  );
}

