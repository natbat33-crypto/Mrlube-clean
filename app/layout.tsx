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
  userScalable: false,
  viewportFit: "cover", // ✅ REQUIRED
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="w-full">
      <body
        className={`
          ${inter.className} ${inter.variable}
          min-h-[100svh]
          w-full
          overflow-x-hidden
          bg-[var(--background,#f8f9fb)]
        `}
      >
        <NameCaptureModal />
        {children}
      </body>
    </html>
  );
}
