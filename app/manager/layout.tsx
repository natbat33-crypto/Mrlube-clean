// app/manager/layout.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X, Building, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, onIdTokenChanged } from "firebase/auth";
import RoleGate from "@/components/RoleGate";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [storeHref, setStoreHref] = React.useState<string>("/manager");
  const router = useRouter();

  // Open sidebar by default on desktop
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setOpen(true);
  }, []);

  //  Guard: if user becomes null, bounce to login
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) router.replace("/auth/login");
    });
    return () => unsub();
  }, [router]);

  // Resolve manager's store link from custom claim
  React.useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (u) => {
      if (!u) {
        setStoreHref("/manager");
        return;
      }
      const token = await u.getIdTokenResult(true);
      const sid = token.claims?.storeId as string | undefined;
      setStoreHref(sid ? `/manager/stores/${sid}` : "/manager");
    });
    return () => unsub();
  }, []);

  return (
    <RoleGate allow={["manager", "admin"]}>
      <div className="min-h-screen bg-background">
        {/* Brand bar */}
        <div className="h-14 bg-[#0b53a6] sticky top-0 z-40">
          <div className="h-full px-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-white font-extrabold text-lg">Mr. Lube</span>
              <span className="inline-flex items-center rounded-full bg-[#f2b705] text-[#1b1b1b] font-bold px-3 py-1">
                Training
              </span>
            </div>
            <button
              className="p-2 rounded text-white hover:bg:white/10 hover:bg-white/10"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle sidebar"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        <div className="relative">
          {/* Sidebar */}
          <aside
            className={`fixed top-14 bottom-0 left-0 z-30 w-64 bg-[#0b53a6] text-white shadow-lg transition-transform duration-300 ease-in-out
                        ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
          >
            <div className="h-full flex flex-col p-4">
              <div className="text-xs uppercase tracking-wide opacity-80 mb-2">Navigation</div>
              <nav className="flex-1 space-y-2">
                <Link
                  href={storeHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded hover:bg-white/10"
                >
                  <Building className="h-5 w-5" /> My Store
                </Link>
              </nav>

              {/* ✅ Sign out goes to /auth/logout (that page signs out + redirects) */}
              <Link
                href="/auth/logout"
                className="mt-auto w-full text-left px-3 py-2 rounded hover:bg-red-500/20 flex items-center gap-2 text-red-100"
              >
                <LogOut className="h-5 w-5" /> Sign out
              </Link>
            </div>
          </aside>

          {/* Click-away overlay (mobile only) */}
          {open && (
            <div
              className="fixed inset-0 bg-black/50 z-20 lg:hidden"
              onClick={() => setOpen(false)}
            />
          )}

          {/* Content */}
          <main className="relative z-10 p-4 lg:p-6 lg:ml-64">{children}</main>
        </div>
      </div>
    </RoleGate>
  );
}
