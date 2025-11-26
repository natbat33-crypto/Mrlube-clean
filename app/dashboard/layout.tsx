"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import RoleGate from "@/components/RoleGate";
import { Menu, X, ChevronDown, LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ❗ SINGLE RoleGate – allow both employee & trainee
  return (
    <RoleGate allow={["employee", "trainee"]}>
      <DashboardShell>{children}</DashboardShell>
    </RoleGate>
  );
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [modulesOpen, setModulesOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setOpen(true);
    }
  }, []);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  const NavLink = ({ href, label }: { href: string; label: string }) => (
    <Link
      href={href}
      className={`block px-3 py-2 rounded-md text-sm font-medium ${
        pathname === href
          ? "bg-[#f2b705] text-black font-semibold"
          : "text-gray-100 hover:bg-[#0e64c9]"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0b53a6] text-white transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#09448a]">
          <h1 className="text-lg font-bold tracking-wide">Mr. Lube Training</h1>
          <button onClick={() => setOpen(false)} className="lg:hidden">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <nav className="px-3 py-4 space-y-1 text-sm">
          <NavLink href="/dashboard" label="Dashboard Home" />

          <div>
            <button
              onClick={() => setModulesOpen((v) => !v)}
              className="w-full flex justify-between items-center px-3 py-2 rounded-md hover:bg-[#0e64c9]"
            >
              <span>Training Modules</span>
              <ChevronDown
                className={`w-4 h-4 transform transition-transform ${
                  modulesOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {modulesOpen && (
              <div className="ml-4 mt-1 space-y-1">
                <NavLink href="/modules/week1" label="Week 1 – Orientation" />
                <NavLink href="/modules/week2" label="Week 2 – Vehicle Basics" />
                <NavLink href="/modules/week3" label="Week 3 – Customer Flow" />
                <NavLink href="/modules/week4" label="Week 4 – Quality & Safety" />
              </div>
            )}
          </div>
        </nav>

        <div className="absolute bottom-0 left-0 w-full px-3 py-4 border-t border-[#09448a]">
          <button
            type="button"
            onClick={async () => {
              try {
                await signOut(auth);
              } finally {
                window.location.assign("/auth/login");
              }
            }}
            className="flex items-center gap-2 text-red-200 hover:text-red-400"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="w-full bg-[#0b53a6] text-white sticky top-0 z-30 flex items-center justify-between px-4 py-3 shadow">
          <button onClick={() => setOpen((v) => !v)} className="lg:hidden">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-lg">Trainee Dashboard</span>
          <span className="hidden lg:block font-semibold text-sm">Employee</span>
        </header>

        <main className="flex-1 p-6 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}



