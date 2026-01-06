"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Menu, X, Building, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import RoleGate from "@/components/RoleGate";

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate allow={["manager", "admin"]}>
      <ManagerShell>{children}</ManagerShell>
    </RoleGate>
  );
}

/* ------------------------------------------------------ */
/*                       SHELL LAYOUT                     */
/* ------------------------------------------------------ */
function ManagerShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  const NavItem = ({
    href,
    label,
    icon,
  }: {
    href: string;
    label: string;
    icon: React.ReactNode;
  }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 px-3 py-3 lg:py-2 rounded-lg text-sm lg:text-base transition-colors
          ${
            active
              ? "bg-white/20 text-white font-semibold"
              : "text-blue-100/80 hover:bg-white/10 hover:text-white"
          }`}
      >
        {icon}
        {label}
      </Link>
    );
  };

  return (
    /* SAFE AREA WRAPPER */
    <div className="safe-area min-h-screen bg-[#f7f7f7]">
      {/* ---------------- TOP BAR ---------------- */}
      <div
        className="
          h-14
          bg-[#0b53a6]
          text-white
          sticky
          top-[env(safe-area-inset-top)]
          z-50
          shadow
        "
      >
        <div className="h-full px-4 flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[#0b53a6] text-white font-extrabold">
              Mr. Lube
            </span>
            <span className="px-3 py-1 rounded-full bg-[#f2b705] text-black font-semibold">
              Training
            </span>
          </div>

          {/* Burger */}
          <button
            className="p-2 rounded hover:bg-white/10"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* ---------------- SIDEBAR ---------------- */}
      <aside
        className={`fixed left-0 w-72 bg-[#0b53a6] text-white shadow-xl
          transition-transform duration-300 z-40
          top-[calc(3.5rem+env(safe-area-inset-top))]
          bottom-0
          ${open ? "translate-x-0" : "-translate-x-full"}
          lg:w-64`}
      >
        <div className="h-full flex flex-col p-4 lg:p-6">

          <NavItem
            href="/manager"
            label="Dashboard"
            icon={<Building className="h-5 w-5 lg:h-4 lg:w-4" />}
          />

          <button
            onClick={() => router.push("/auth/logout")}
            className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg text-red-100 hover:bg-red-500/20"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ---------------- MAIN CONTENT ---------------- */}
      <main className="transition-all duration-300 p-4 lg:p-6 break-words">
        {children}

        <footer className="mt-6 pt-4 text-center text-xs text-gray-500 border-t">
          © {new Date().getFullYear()} Mr. Lube. All rights reserved.
        </footer>
      </main>
    </div>
  );
}
