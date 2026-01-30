"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/* ========================================
   HELPERS
======================================== */
function getReviewUid(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("reviewUid");
}

/* ========================================
   COMPONENT — STABLE NAV DASHBOARD
======================================== */
export default function SupervisorPage() {
  const reviewUid = getReviewUid();

  const withAs = (path: string) =>
    reviewUid ? `${path}?as=${reviewUid}` : path;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Trainer Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Select a section to review trainee progress.
        </p>
      </header>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={withAs("/supervisor/day1")}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Day 1</CardTitle>
              <CardDescription>Review Day 1 tasks</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        </Link>

        {[1, 2, 3, 4].map((week) => (
          <Link key={week} href={withAs(`/supervisor/week${week}`)}>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Week {week}</CardTitle>
                <CardDescription>
                  Review Week {week} tasks
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}


