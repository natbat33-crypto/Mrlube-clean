import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // ⭐ 1. Developer bypass: ?admin=1 → full access
  if (url.searchParams.get("admin") === "1") {
    return NextResponse.next();
  }

  // ⭐ 2. Allow auth routes normally (login, signup, reset)
  if (url.pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // ⭐ 3. Allow static & Next.js assets
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/static") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js")
  ) {
    return NextResponse.next();
  }

  // ⭐ 4. Everything else → Maintenance
  return NextResponse.rewrite(new URL("/maintenance.html", req.url));
}

export const config = {
  matcher: "/:path*",
};
