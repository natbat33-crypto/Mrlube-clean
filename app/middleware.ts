// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Public routes (Apple reviewers must always reach these)
  const publicRoutes = [
    "/",
    "/login",
    "/signup",
  ];

  // Allow Next internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Always allow public routes
  if (publicRoutes.some(r => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // ❗ DO NOT redirect to /unauthorized here
  // Client-side auth will handle role checks after login
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
