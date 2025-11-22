// app/admin/layout.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Building, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import RoleGate from "@/components/RoleGate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Open by default on desktop
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setOpen(true);
  }, []);

  // Close sidebar on route change (useful on mobile)
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) setOpen(false);
  }, [pathname]);

  // 🔐 Auth guard — bounce to login if user is null
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  const item =
    "block px-3 py-2 rounded flex items-center gap-2 transition-colors";
  const active = "bg-white/15 text-white";
  const idle = "hover:bg-white/10 text-white/90";

  return (
    <RoleGate expectedRole="admin">
      <div className="min-h-screen bg-background">
        {/* Brand bar */}
        <div className="w-full bg-[#0b53a6] sticky top-0 z-40">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
            <Link href="/admin" className="flex items-center gap-3">
              <span className="text-white font-extrabold text-lg">Mr. Lube</span>
              <span className="inline-flex items-center rounded-full bg-[#f2b705] text-[#1b1b1b] font-bold px-3 py-1">
                Training
              </span>
            </Link>

            <button
              className="p-2 rounded text-white hover:bg-white/10 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle sidebar"
              title={open ? "Hide sidebar" : "Show sidebar"}
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        <div className="relative">
          {/* Sidebar */}
          <aside
            className={`fixed top-[56px] left-0 bottom-0 z-30 w-64 bg-[#0b53a6] text-white shadow-lg
                        transform transition-transform duration-300 ease-in-out
                        ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
          >
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 text-xs uppercase tracking-wide opacity-80">
                Navigation
              </div>

              <nav className="px-2 space-y-1">
                <Link
                  href="/admin/stores"
                  className={`${item} ${pathname.startsWith("/admin/stores") ? active : idle}`}
                  aria-current={pathname.startsWith("/admin/stores") ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Building className="h-5 w-5" />
                  <span>Stores</span>
                </Link>
              </nav>

              {/* ✅ Sign out goes to /auth/logout (that page signs out + redirects) */}
              <div className="mt-auto px-2 pb-4">
                <Link
                  href="/auth/logout"
                  className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-red-500/20 text-red-100"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Sign out</span>
                </Link>
              </div>
            </div>
          </aside>

          {/* Click-away overlay (mobile) */}
          {open && (
            <button
              className="fixed inset-0 bg-black/50 z-20 lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close sidebar"
            />
          )}

          {/* Content */}
          <main className="relative z-10 p-4 lg:p-6 transition-[margin] duration-300 lg:ml-64">
            {children}
          </main>
        </div>
      </div>
    </RoleGate>
  );
}

