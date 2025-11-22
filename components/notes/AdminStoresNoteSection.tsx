// components/notes/AdminStoreNotesSection.tsx
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import NoteComposer from "@/components/notes/NoteComposer";

export default function AdminStoreNotesSection({ storeId }: { storeId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a Note to Manager</CardTitle>
        <CardDescription>This note is tied to this store.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Admin → Manager, store fixed (no dropdown) */}
        <NoteComposer fromRole="admin" toRole="manager" fixedStoreId={storeId} />
      </CardContent>
    </Card>
  );
}
