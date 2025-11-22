"use client";

/*
  Copyright (c) 2025 Natalie Gagnon.
  All rights reserved.
  Licensed to Mr. Lube for internal use only.
  Redistribution or use outside the license terms is prohibited.
*/

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MrLubeLogo } from "@/components/mr-lube-logo";
import { Button } from "@/components/ui/button";
import { useAuthUser } from "@/lib/useAuthUser";
import { Users, BookOpen, Settings, Menu, X, ChevronDown } from "lucide-react";
import SignOutButton from "@/components/SignOutButton";

export function SimpleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { displayName, initials } = useAuthUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const initiallyOpen =
    pathname?.startsWith("/dashboard/week") || pathname?.startsWith("/dashboard/day-1");
  const [isTrainingOpen, setIsTrainingOpen] = React.useState(!!initiallyOpen);

  const topNav = [{ name: "Dashboard", href: "/dashboard", icon: Users }];
  const trainingWeeks = [
    { label: "Day-1", href: "/dashboard/day-1" },
    { label: "Week 1", href: "/dashboard/week1" },
    { label: "Week 2", href: "/dashboard/week2" },
    { label: "Week 3", href: "/dashboard/week3" },
    { label: "Week 4", href: "/dashboard/week4" },
  ];

  const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setIsMobileMenuOpen(false)}
        className={`flex items-center gap-3 px-3 py-3 lg:py-2 rounded-lg transition-colors text-sm lg:text-base ${
          isActive
            ? "bg-primary-foreground/20 text-primary-foreground"
            : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
        }`}
      >
        {children}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar with hamburger */}
      <div className="bg-primary text-primary-foreground p-3 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <MrLubeLogo className="h-7" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsMobileMenuOpen((v) => !v)}
          className="text-primary-foreground hover:bg-primary-foreground/10 p-2 h-10 w-10"
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      <div className="flex">
        {/* Slide-in sidebar */}
        <aside
          className={`fixed left-0 top-0 h-screen w-72 z-50 bg-primary text-primary-foreground transform transition-transform duration-300 ease-in-out
                      ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col">
            {/* Brand */}
            <div className="p-4 lg:p-6 border-b border-primary-foreground/20">
              <MrLubeLogo className="h-8 lg:h-10" />
            </div>

            {/* User */}
            <div className="p-4 lg:p-6 border-b border-primary-foreground/20">
              <div className="flex items-center gap-3">
                <div className="bg-accent text-accent-foreground w-12 h-12 rounded-full flex items-center justify-center font-semibold">
                  {initials || "U"}
                </div>
                <div>
                  <p className="font-semibold">{displayName || "Employee"}</p>
                  <p className="text-sm text-primary-foreground/70">Employee</p>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 lg:p-6">
              <div className="flex h-full flex-col">
                <ul className="space-y-1">
                  {topNav.map((item) => (
                    <li key={item.name}>
                      <NavLink href={item.href}>
                        <item.icon className="h-5 w-5 lg:h-4 lg:w-4" />
                        {item.name}
                      </NavLink>
                    </li>
                  ))}
                </ul>

                {/* Training collapsible */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setIsTrainingOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-base
                               text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    aria-expanded={isTrainingOpen}
                    aria-controls="training-submenu"
                  >
                    <span className="inline-flex items-center gap-3">
                      <BookOpen className="h-5 w-5 lg:h-4 lg:w-4" />
                      My Training
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isTrainingOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isTrainingOpen && (
                    <ul id="training-submenu" className="mt-1 pl-9 space-y-1">
                      {trainingWeeks.map((w) => {
                        const active = pathname === w.href;
                        return (
                          <li key={w.href}>
                            <Link
                              href={w.href}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className={`block px-3 py-2 rounded-lg transition-colors ${
                                active
                                  ? "bg-primary-foreground/20 text-primary-foreground"
                                  : "text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
                              }`}
                            >
                              {w.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Bottom */}
                <div className="mt-auto pt-4">
                  <NavLink href="/dashboard/settings">
                    <Settings className="h-5 w-5 lg:h-4 lg:w-4" />
                    Settings
                  </NavLink>
                  <SignOutButton />
                </div>
              </div>
            </nav>
          </div>
        </aside>

        {/* Click-to-close overlay */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Content area */}
        <div className="flex-1">
          <main className="p-4 lg:p-6 min-h-screen flex flex-col">
            <div className="flex-1">{children}</div>

            <footer className="mt-6 lg:mt-8 pt-4 lg:pt-6 border-t border-border">
              <div className="text-center text-xs lg:text-sm text-muted-foreground">
                <p>© {new Date().getFullYear()} Mr. Lube. All rights reserved.</p>
              </div>
            </footer>
          </main>
        </div>
      </div>

      {/* 🔥 CSS injected here */}
      <style jsx global>{`
        .bg-primary { background-color: #0b3d91 !important; }
        .text-primary { color: #0b3d91 !important; }
        .bg-accent { background-color: #ffc20e !important; }
        .text-accent-foreground { color: #0b3d91 !important; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
          box-shadow: 0 1px 2px rgba(0,0,0,.06); }
        .card h1, .card h2, .card h3 { font-weight: 600; }
        .progress-yellow > div { background-color: #ffc20e !important; }
        .text-muted-foreground { color: #6b7280 !important; }
      `}</style>
    </div>
  );
}