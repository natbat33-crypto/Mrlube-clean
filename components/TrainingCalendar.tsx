// components/TrainingCalendar.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  startDate?: Date | null;   // from Firestore
  endDate?: Date | null;     // from Firestore (optional — if empty, we derive using durationDays)
  durationDays?: number;     // default 30
};

export default function TrainingCalendar({ startDate, endDate, durationDays = 30 }: Props) {
  const router = useRouter();

  // Pick the month to show: prefer the month of startDate, otherwise today
  const initialMonth = useMemo(() => {
    const base = startDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  }, [startDate]);

  const [month, setMonth] = useState<Date>(initialMonth);

  // Derived end if not provided
  const derivedEnd = useMemo(() => {
    if (!startDate) return null;
    if (endDate) return endDate;
    return new Date(startDate.getTime() + durationDays * 86400000);
  }, [startDate, endDate, durationDays]);

  // helpers
  const addMonths = (d: Date, by: number) =>
    new Date(d.getFullYear(), d.getMonth() + by, 1);
  const isSameDay = (a?: Date | null, b?: Date | null) =>
    !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  // Build the 6x7 grid for the current month
  const { grid } = useMemo(() => {
    const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const startWeekday = firstOfMonth.getDay(); // 0=Sun..6=Sat
    const firstCell = new Date(firstOfMonth);
    firstCell.setDate(firstOfMonth.getDate() - startWeekday);

    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(firstCell);
      d.setDate(firstCell.getDate() + i);
      cells.push(d);
    }
    return { grid: cells };
  }, [month]);

  // Is date in the training window (inclusive)?
  const inWindow = (d: Date) => {
    if (!startDate || !derivedEnd) return false;
    return d >= stripTime(startDate) && d <= stripTime(derivedEnd);
  };

  // Compute training “week” number (1..4) from a date
  const weekIndexFromDate = (d: Date) => {
    if (!startDate) return null;
    const daysFromStart = Math.floor((stripTime(d).getTime() - stripTime(startDate).getTime()) / 86400000);
    if (daysFromStart < 0) return null;
    return Math.min(4, Math.floor(daysFromStart / 7) + 1);
  };

  // Go to the Week route when a day is clicked
  const onDayClick = (d: Date) => {
    const w = weekIndexFromDate(d);
    if (w) router.push(`/dashboard/week${w}`);
  };

  const labelMonth = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="rounded-lg border border-primary/20 bg-card">
      {/* Header: month switcher */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-primary/10">
        <button
          className="px-2 py-1 rounded hover:bg-primary/10"
          onClick={() => setMonth(m => addMonths(m, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="font-semibold">{labelMonth}</div>
        <button
          className="px-2 py-1 rounded hover:bg-primary/10"
          onClick={() => setMonth(m => addMonths(m, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground px-2 pt-2">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1 p-2">
        {grid.map((d) => {
          const isCurrentMonth = d.getMonth() === month.getMonth();
          const inRange = inWindow(d);
          const weekIndex = inRange ? weekIndexFromDate(d) : null;

          return (
            <button
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              className={[
                "h-10 rounded-md border text-sm flex items-center justify-center relative",
                isCurrentMonth ? "bg-white text-foreground" : "bg-muted text-muted-foreground",
                inRange ? "ring-1 ring-yellow-400" : "",
                "active:scale-[0.98] transition"
              ].join(" ")}
            >
              <span>{d.getDate()}</span>

              {/* Tiny week badge inside training window */}
              {weekIndex && (
                <span className="absolute bottom-0.5 right-0.5 text-[10px] font-semibold px-1 rounded bg-yellow-400/90 text-black">
                  W{weekIndex}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 pb-3 text-xs text-muted-foreground">
        Tap a day to jump to the corresponding week (W1–W4).
      </div>
    </div>
  );
}

function stripTime(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}