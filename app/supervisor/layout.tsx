"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Users, ClipboardCheck, LogOut, ChevronDown } from "lucide-react";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import RoleGate from "@/components/RoleGate";

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Open sidebar by default on desktop
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setOpen(true);
    }
  }, []);

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 px-3 py-3 lg:py-2 rounded-lg transition-colors
          text-sm lg:text-base
          ${active
            ? "bg-white/20 text-white font-semibold"
            : "text-blue-100/80 hover:text-white hover:bg-white/10"}
        `}
      >
        <Users className="h-5 w-5 lg:h-4 lg:w-4" />
        {label}
      </Link>
    );
  };

  const WeekLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={`block px-3 py-2 rounded-lg text-sm lg:text-base transition-colors
          ${active
            ? "bg-white/20 text-white font-semibold"
            : "text-blue-100/80 hover:text-white hover:bg-white/10"}
        `}
      >
        {label}
      </Link>
    );
  };

  return (
    <RoleGate allow={["supervisor", "admin"]}>
      <div className="min-h-screen bg-[#f7f7f7]">
        
        {/* TOP BAR */}
        <div className="h-14 bg-[#0b53a6] text-white sticky top-0 z-50 shadow">
          <div className="h-full px-4 flex items-center justify-between">
            
            {/* Brand */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#0b53a6] text-white font-extrabold">
                Mr. Lube
              </span>
              <span className="px-3 py-1 rounded-full bg-[#f2b705] text-black font-semibold">
                Training
              </span>
            </div>

            {/* Burger Button */}
            <button
              onClick={() => setOpen(!open)}
              className="p-2 rounded hover:bg-white/10"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* SIDEBAR */}
        <aside
          className={`
            fixed top-14 bottom-0 left-0 w-72 bg-[#0b53a6] text-white shadow-xl
            transition-transform duration-300 z-40
            ${open ? "translate-x-0" : "-translate-x-full"}
            lg:translate-x-0 lg:w-64
          `}
        >
          <div className="h-full flex flex-col p-4 lg:p-6">

            <NavLink href="/supervisor" label="Dashboard" />

            <div className="mt-4">
              <div className="px-3 py-2 text-white/70 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4" /> Review
                </span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </div>

              <ul className="pl-6 mt-1 space-y-1">
                <WeekLink href="/supervisor/week1" label="Week 1" />
                <WeekLink href="/supervisor/week2" label="Week 2" />
                <WeekLink href="/supervisor/week3" label="Week 3" />
                <WeekLink href="/supervisor/week4" label="Week 4" />
              </ul>
            </div>

            <button
              onClick={() => signOut(auth)}
              className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg text-red-100 hover:bg-red-500/20"
            >
              <LogOut className="h-5 w-5" /> Sign out
            </button>
          </div>
        </aside>

        {/* CLICK-AWAY OVERLAY */}
        {open && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* CONTENT */}
        <main className={`transition-all duration-300 p-4 lg:p-6 ${open ? "lg:ml-64" : ""}`}>
          {children}

          <footer className="mt-6 pt-4 text-center text-xs text-gray-500 border-t">
            © {new Date().getFullYear()} Mr. Lube. All rights reserved.
          </footer>
        </main>

      </div>
    </RoleGate>
  );
}

