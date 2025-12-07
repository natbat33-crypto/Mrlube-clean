import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // 1️⃣ Developer bypass
  // If you add ?admin=1 to ANY URL, you get FULL ACCESS
  if (url.searchParams.get("admin") === "1") {
    return NextResponse.next();
  }

  // 2️⃣ Allow ALL auth routes to load normally (signup, login, reset, etc)
  if (url.pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // 3️⃣ Allow all static and framework files (fixes infinite loading)
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/static") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".jpg") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js")
  ) {
    return NextResponse.next();
  }

  // 4️⃣ Everyone else sees maintenance mode
  return NextResponse.rewrite(new URL("/maintenance.html", req.url));
}

export const config = {
  matcher: "/:path*",
};
