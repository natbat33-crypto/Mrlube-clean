"use client";

import Link from "next/link";
import RoleGate from "@/components/RoleGate";

export default function AdminHome() {
  return (
    <RoleGate allow={["admin"]}>
      <main className="p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Oversee all stores, managers, trainers, and trainee progress.
          </p>
        </header>

        {/* Stores */}
        <div className="rounded-xl border bg-white/50 p-6">
          <h2 className="text-xl font-semibold mb-2">Stores</h2>
          <p className="text-sm text-gray-600 mb-3">
            View employees, trainers, trainees, and progress for every store.
          </p>
          <Link
            href="/admin/stores"
            className="inline-flex items-center text-sm border rounded-full px-3 py-1.5 hover:bg-gray-50"
          >
            Open Stores →
          </Link>
        </div>

        {/* New Users card intentionally removed */}
      </main>
    </RoleGate>
  );
}
