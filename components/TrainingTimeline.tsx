"use client";

import * as React from "react";
import { differenceInCalendarDays, addDays, format, startOfDay } from "date-fns";
import { CalendarDays } from "lucide-react";

/** Props:
 * - startDate: ISO string like "2025-09-01" (defaults to today)
 * - durationDays: total training days (defaults 30)
 */
export default function TrainingTimeline({
  startDate,
  durationDays = 30,
}: {
  startDate?: string;        // e.g. "2025-09-01"
  durationDays?: number;     // e.g. 30
}) {
  // Resolve dates
  const start = React.useMemo(
    () => (startDate ? startOfDay(new Date(startDate)) : startOfDay(new Date())),
    [startDate]
  );
  const end = React.useMemo(() => addDays(start, Math.max(durationDays - 1, 0)), [start, durationDays]);
  const today = startOfDay(new Date());

  // Progress / countdown
  const total = Math.max(durationDays, 1);
  const elapsed = Math.min(Math.max(differenceInCalendarDays(today, start) + 1, 0), total);
  const left = Math.max(total - elapsed, 0);
  const pct = Math.round((elapsed / total) * 100);

  // Build 4-week (7-day) rows + remainder if any
  const days: Date[] = Array.from({ length: total }, (_, i) => addDays(start, i));
  const weeks: Date[][] = [];
  let idx = 0;
  for (let w = 0; idx < days.length; w++) {
    weeks.push(days.slice(idx, idx + 7));
    idx += 7;
  }

  return (
    <div className="border border-primary/20 rounded-xl bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 lg:p-5 border-b">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold text-primary text-sm lg:text-base">
              30-Day Training Timeline
            </div>
            <div className="text-xs text-muted-foreground">
              Start: {format(start, "MMM d, yyyy")} • End: {format(end, "MMM d, yyyy")}
            </div>
          </div>
        </div>

        {/* Countdown pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Days left</span>
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            {left}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 lg:px-5 pt-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Progress</span>
          <span className={pct >= 80 ? "text-green-600" : pct >= 50 ? "text-yellow-600" : "text-red-600"}>
            {pct}%
          </span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300"
            style={{ width: `${pct}%`, backgroundColor: "#facc15" }} // yellow-400
            aria-hidden
          />
        </div>
      </div>

      {/* Calendar */}
      <div className="p-4 lg:p-5">
        <div className="grid gap-3">
          {weeks.map((row, i) => (
            <div key={i} className="rounded-xl p-3">
              <div className="text-xs font-semibold text-primary mb-2">Week {i + 1}</div>
              <div className="grid grid-cols-7 gap-2">
                {row.map((d, j) => {
                  const isPastOrToday = d <= today && d >= start;
                  const isToday = d.getTime() === today.getTime();
                  const isFuture = d > today;

                  // styles
                  const base =
                    "h-10 rounded-md border flex flex-col items-center justify-center text-[11px]";
                  const pastCls = "border-green-300 bg-green-50 text-green-800";
                  const futureCls = "bg-card text-muted-foreground";
                  const todayRing = "ring-2 ring-primary";

                  return (
                    <div
                      key={`${i}-${j}`}
                      className={[
                        base,
                        isToday ? todayRing : "",
                        isPastOrToday ? pastCls : "",
                        isFuture ? futureCls : "",
                      ].join(" ")}
                      title={format(d, "MMM d, yyyy")}
                    >
                      <div className="font-semibold">
                        {format(d, "d")}
                      </div>
                      <div className="uppercase tracking-wide">
                        {format(d, "EEE").slice(0, 2)}
                      </div>
                    </div>
                  );
                })}
                {/* Fill the last row with blanks so the grid stays tidy */}
                {row.length < 7 &&
                  Array.from({ length: 7 - row.length }).map((_, k) => (
                    <div
                      key={`pad-${k}`}
                      className="h-10 rounded-md border border-transparent"
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}