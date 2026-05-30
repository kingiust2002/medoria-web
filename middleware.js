// middleware.js — send locale-less paths to the default locale (fa).
// The root path "/" is handled by app/page.jsx (which also respects a saved
// language), so we skip it here and only rewrite deeper locale-less paths
// like /catalog → /fa/catalog.
import { NextResponse } from "next/server";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req) {
  const { pathname } = req.nextUrl;

  if (
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return;
  }

  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  if (hasLocale) return;

  const url = req.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
