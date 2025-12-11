// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// ⬅ ADD THIS
import NameCaptureModal from "./NameCaptureModal";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Mr. Lube Training App",
  description: "Training management system for Mr. Lube employees",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${inter.variable}`}>
        
        {/* 🔥 GLOBAL NAME POPUP */}
        <NameCaptureModal />

        {children}
      </body>
    </html>
  );
}
