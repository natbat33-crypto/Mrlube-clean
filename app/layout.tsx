// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import NameCaptureModal from "./NameCaptureModal";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Mr. Lube Training App",
  description: "Training management system for Mr. Lube employees",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // ✅ prevents zoom bugs on iOS
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`
          ${inter.className} ${inter.variable}
          min-h-screen
          w-full
          overflow-x-hidden
          bg-[var(--background,#f8f9fb)]
        `}
      >
        {/* GLOBAL NAME POPUP */}
        <NameCaptureModal />

        {/* GLOBAL MOBILE CONTAINER */}
        <div className="relative w-full max-w-full overflow-x-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
