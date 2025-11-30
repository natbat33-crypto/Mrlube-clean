"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import RoleGate from "@/components/RoleGate";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGate allow={["employee", "trainee"]}>
      <DashboardShell>{children}</DashboardShell>
    </RoleGate>
  );
}

/* ------------------------------------------------------ */
/*                     SHELL LAYOUT                       */
/* ------------------------------------------------------ */
function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // redirect if no auth
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={`block px-3 py-2 rounded-lg text-sm transition-colors
          ${
            active
              ? "bg-white/20 text-white font-semibold"
              : "text-white/80 hover:text-white hover:bg-white/10"
          }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      {/* ----------------- TOP BAR ----------------- */}
      <div className="h-14 bg-[#0b53a6] text-white sticky top-0 z-50 shadow">
        <div className="h-full px-4 flex items-center justify-between">
          {/* Branding */}
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[#0b3d91] text-white font-extrabold">
              Mr. Lube
            </span>
            <span className="px-3 py-1 rounded-full bg-[#f2b705] text-black font-semibold">
              Training
            </span>
          </div>

          {/* Burger */}
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="p-2 rounded hover:bg-white/10"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* ----------------- SIDEBAR ----------------- */}
      <aside
        className={`fixed top-14 bottom-0 left-0 w-72 bg-[#0b53a6] text-white shadow-xl
          transition-transform duration-300 z-40
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:w-64`}
      >
        <div className="h-full flex flex-col p-4 lg:p-6">
          {/* Dashboard Home */}
          <NavLink href="/dashboard" label="Dashboard Home" />

          {/* --------- REMOVED MODULES SECTION --------- */}
          {/* NOTHING ELSE REMOVED */}

          {/* Sign Out */}
          <button
            onClick={async () => {
              try {
                await signOut(auth);
              } finally {
                window.location.assign("/auth/login");
              }
            }}
            className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg text-red-200 hover:bg-red-500/20"
          >
            <LogOut className="h-5 w-5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay (mobile) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ----------------- MAIN CONTENT ----------------- */}
      <main className={`transition-all duration-300 p-4 lg:p-6`}>
        {children}

        <footer className="mt-6 pt-4 text-center text-xs text-gray-500 border-t">
          © {new Date().getFullYear()} Mr. Lube. All rights reserved.
        </footer>
      </main>
    </div>
  );
}

