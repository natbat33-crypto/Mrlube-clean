import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // 1. Allow developer override with ?admin
  if (url.searchParams.has("admin")) {
    return NextResponse.next();
  }

  // 2. Allow static and framework assets
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

  // 3. Allow auth pages to load normally (signup/login)
  if (url.pathname.startsWith("/auth")) {
    return NextResponse.next();
  }

  // 4. Everyone else sees maintenance mode
  url.pathname = "/maintenance.html";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/:path*",
};
