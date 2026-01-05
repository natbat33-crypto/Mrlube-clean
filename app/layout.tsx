// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import NameCaptureModal from "./NameCaptureModal";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Mr. Lube Training App",
  description: "Training management system for Mr. Lube employees",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // prevents zoom bugs on iOS
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full w-full">
      <body
        className={`
          ${inter.className} ${inter.variable}
          min-h-screen
          w-full
          overflow-x-hidden
          bg-[var(--background,#f8f9fb)]

          /* iOS SAFE AREA FIXES */
          pt-[env(safe-area-inset-top)]
          pb-[env(safe-area-inset-bottom)]
          pl-[env(safe-area-inset-left)]
          pr-[env(safe-area-inset-right)]
        `}
      >
        {/* GLOBAL NAME POPUP (unchanged) */}
        <NameCaptureModal />

        {/* GLOBAL APP WRAPPER */}
        <div
          className="
            relative
            w-full
            max-w-full
            min-h-screen
            overflow-x-hidden
          "
        >
          {children}
        </div>
      </body>
    </html>
  );
}
