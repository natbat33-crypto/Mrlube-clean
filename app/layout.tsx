// app/layout.tsx
import type React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import GlobalStyles from "./GlobalStyles";

// ✅ NEW: bring in the provider
import StoreProvider from "@/app/providers/StoreProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Mr. Lube Training App",
  description: "Training management system for Mr. Lube employees",
  generator: "v0.app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Map your CSS variables to Tailwind tokens so colors work */}
        <Script id="tw-config" strategy="beforeInteractive">{`
          window.tailwind = window.tailwind || {};
          window.tailwind.config = {
            darkMode: "class",
            theme: {
              extend: {
                colors: {
                  background: "var(--background)",
                  foreground: "var(--foreground)",
                  card: "var(--card)",
                  "card-foreground": "var(--card-foreground)",
                  popover: "var(--popover)",
                  "popover-foreground": "var(--popover-foreground)",
                  primary: "var(--primary)",
                  "primary-foreground": "var(--primary-foreground)",
                  secondary: "var(--secondary)",
                  "secondary-foreground": "var(--secondary-foreground)",
                  muted: "var(--muted)",
                  "muted-foreground": "var(--muted-foreground)",
                  accent: "var(--accent)",
                  "accent-foreground": "var(--accent-foreground)",
                  destructive: "var(--destructive)",
                  "destructive-foreground": "var(--destructive-foreground)",
                  border: "var(--border)",
                  input: "var(--input)",
                  ring: "var(--ring)"
                },
                borderRadius: {
                  sm: "calc(var(--radius) - 4px)",
                  md: "calc(var(--radius) - 2px)",
                  lg: "var(--radius)",
                  xl: "calc(var(--radius) + 4px)"
                },
                fontFamily: {
                  sans: ['var(--font-inter)','ui-sans-serif','system-ui','sans-serif'],
                  mono: ['ui-monospace','SFMono-Regular','Consolas','Menlo','monospace']
                }
              }
            }
          };
        `}</Script>
        {/* Load Tailwind in the browser so utilities apply now */}
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      </head>
      <body
        data-layout="root"
        className={`${inter.className} ${inter.variable} bg-background text-foreground`}
      >
        {/* ✅ NEW: provide store/role to the whole app */}
        <StoreProvider>
          {children}
        </StoreProvider>

        <GlobalStyles />
      </body>
    </html>
  );
}


