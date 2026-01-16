"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  Users,
  ClipboardCheck,
  LogOut,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { signOut, onAuthStateChanged } from "firebase/auth";
import RoleGate from "@/components/RoleGate";
import { doc, getDoc } from "firebase/firestore";

export default function SupervisorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [open, setOpen] = React.useState(false);
  const [storeId, setStoreId] = React.useState<string | null>(null);

  /* -------------------------------------------------------
     AUTH LISTENER → redirect immediately if logged out
  -------------------------------------------------------- */
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        window.location.assign("/auth/login");
      }
    });
    return unsub;
  }, []);

  /* -------------------------------------------------------
     FETCH STORE ID FOR NOTES LINK
  -------------------------------------------------------- */
  React.useEffect(() => {
    async function load() {
      const u = auth.currentUser;
      if (!u) return;

      const tok = await u.getIdTokenResult(true);
      if (tok?.claims?.storeId) {
        setStoreId(String(tok.claims.storeId));
        return;
      }

      const knownStores = ["24", "26", "46", "79", "163", "262", "276", "298"];
      for (const sid of knownStores) {
        const ref = doc(db, "stores", sid, "employees", u.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setStoreId(sid);
          return;
        }
      }
    }
    load();
  }, []);

  /* -------------------------------------------------------
     NAV LINK HELPERS
  -------------------------------------------------------- */
  const NavLink = ({
    href,
    icon,
    label,
  }: {
    href: string;
    icon: React.ReactNode;
    label: string;
  }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 px-3 py-3 lg:py-2 rounded-lg transition-colors
          text-sm lg:text-base
          ${
            active
              ? "bg-white/20 text-white font-semibold"
              : "text-blue-100/80 hover:text-white hover:bg-white/10"
          }`}
      >
        {icon}
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
          ${
            active
              ? "bg-white/20 text-white font-semibold"
              : "text-blue-100/80 hover:text-white hover:bg-white/10"
          }`}
      >
        {label}
      </Link>
    );
  };

  /* -------------------------------------------------------
     LAYOUT
  -------------------------------------------------------- */
  return (
    <RoleGate allow={["supervisor", "admin"]}>
      <div className="safe-area min-h-[100svh] bg-[#f7f7f7]">

        {/* TOP BAR */}
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
            {/* BRAND */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-[#0b53a6] text-white font-extrabold">
                Mr. Lube
              </span>
              <span className="px-3 py-1 rounded-full bg-[#f2b705] text-black font-semibold">
                Training
              </span>
            </div>

            {/* BURGER */}
            <button
              onClick={() => setOpen((p) => !p)}
              className="p-2 rounded hover:bg-white/10"
            >
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* SIDEBAR */}
        <aside
          className={`fixed left-0 w-72 bg-[#0b53a6] text-white shadow-xl
            transition-transform duration-300 z-40
            top-[calc(3.5rem+env(safe-area-inset-top))]
            bottom-0
            ${open ? "translate-x-0" : "-translate-x-full"}
            lg:w-64`}
        >
          <div className="h-full flex flex-col p-4 lg:p-6">

            <NavLink
              href="/supervisor"
              label="Dashboard"
              icon={<Users className="h-5 w-5 lg:h-4 lg:w-4" />}
            />

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

            {storeId && (
              <div className="mt-6">
                <NavLink
                  href={`/supervisor/notes?store=${storeId}`}
                  label="Notes"
                  icon={<MessageSquare className="h-5 w-5 lg:h-4 lg:w-4" />}
                />
              </div>
            )}

            {/* -------------------------------------------------------
                FIXED SIGN OUT (NO MORE 404)
            -------------------------------------------------------- */}
            <button
              onClick={async () => {
                try {
                  await signOut(auth);
                } finally {
                  window.location.assign("/auth/login");
                }
              }}
              className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg text-red-100 hover:bg-red-500/20"
            >
              <LogOut className="h-5 w-5" /> Sign out
            </button>

          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 bg-black/40 z-30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        {/* MAIN */}
        <main
          className={`transition-all duration-300 p-4 lg:p-6 ${
            open ? "lg:ml-64" : ""
          }`}
        >
          {children}

          <footer className="mt-6 pt-4 text-center text-xs text-gray-500 border-t">
            © {new Date().getFullYear()} Mr. Lube. All rights reserved.
          </footer>
        </main>

      </div>
    </RoleGate>
  );
}
