import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // developer bypass
  if (url.searchParams.get("admin") === "1") {
    return NextResponse.next();
  }

  // everyone else sees maintenance
  return NextResponse.rewrite(new URL("/maintenance.html", req.url));
}

export const config = {
  matcher: "/:path*",
};
