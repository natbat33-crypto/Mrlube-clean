// app/supervisor/layout.tsx
"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Users, ClipboardCheck, LogOut, ChevronDown } from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import RoleGate from "@/components/RoleGate";

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Open sidebar by default on desktop
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setOpen(true);
  }, []);

  // Auth guard — if user becomes null, go back to login
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  const NavLink = ({ href, children }: { href: string; children: ReactNode }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 px-3 py-3 lg:py-2 rounded-lg transition-colors text-sm lg:text-base ${
          active
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
        }`}
      >
        {children}
      </Link>
    );
  };

  const reviewLinks = [
    { href: "/supervisor/week1", label: "Week 1" },
    { href: "/supervisor/week2", label: "Week 2" },
    { href: "/supervisor/week3", label: "Week 3" },
    { href: "/supervisor/week4", label: "Week 4" },
  ];

  return (
    <RoleGate allow={["supervisor", "admin"]}>
      <div className="min-h-screen bg-background">
        {/* Top bar */}
        <div className="h-14 bg-primary text-primary-foreground sticky top-0 z-50 shadow-sm">
          <div className="h-full px-3 flex items-center justify-between">
            {/* Brand */}
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="inline-flex items-center rounded-full bg-[#0b53a6] text-white font-extrabold text-sm sm:text-base px-3 py-1">
                Mr. Lube
              </span>
              <span className="inline-flex items-center rounded-full bg-[#f2b705] text-[#1b1b1b] font-semibold text-sm sm:text-base px-3 py-1">
                Training
              </span>
            </div>

            <button
              onClick={() => setOpen((v) => !v)}
              className="p-2 rounded hover:bg-primary-foreground/10"
              aria-label="Toggle menu"
              title={open ? "Hide menu" : "Show menu"}
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        <div className="relative">
          {/* Sidebar */}
          <aside
            className={`fixed left-0 z-40 w-72 bg-primary text-primary-foreground shadow-lg
                        transition-transform duration-300 ease-in-out
                        top-14 bottom-0
                        ${open ? "translate-x-0" : "-translate-x-full"}
                        lg:w-64`}
          >
            <div className="flex h-full flex-col p-4 lg:p-6">
              <ul className="space-y-1">
                <li>
                  <NavLink href="/supervisor">
                    <Users className="h-5 w-5 lg:h-4 lg:w-4" />
                    Dashboard
                  </NavLink>
                </li>
              </ul>

              <div className="mt-4">
                <div className="w-full flex items-center justify-between px-3 py-3 lg:py-2 rounded-lg text-sm lg:text-base text-primary-foreground/80">
                  <span className="inline-flex items-center gap-3">
                    <ClipboardCheck className="h-5 w-5 lg:h-4 lg:w-4" />
                    Review
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </div>
                <ul className="mt-1 pl-9 space-y-1">
                  {reviewLinks.map(({ href, label }) => {
                    const active = pathname === href;
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className={`block px-3 py-2 rounded-lg text-sm lg:text-base transition-colors ${
                            active
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                          }`}
                        >
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* ✅ Sign out goes to logout route (no blank, no race) */}
              <Link
                href="/auth/logout"
                className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg text-sm lg:text-base text-red-100 hover:bg-red-500/20"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </Link>
            </div>
          </aside>

          {/* Click-away overlay */}
          {open && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setOpen(false)} />}

          {/* Content */}
          <main
            className={`relative z-10 p-4 lg:p-6 transition-[margin] duration-300 ${
              open ? "lg:ml-64" : "lg:ml-0"
            }`}
          >
            <div className="min-h-[calc(100vh-6rem)]">{children}</div>
            <footer className="mt-6 lg:mt-8 pt-4 lg:pt-6 border-t border-border">
              <div className="text-center text-xs lg:text-sm text-muted-foreground">
                © {new Date().getFullYear()} Mr. Lube. All rights reserved.
              </div>
            </footer>
          </main>
        </div>
      </div>
    </RoleGate>
  );
}

