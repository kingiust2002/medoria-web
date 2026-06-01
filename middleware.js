// middleware.js — send locale-less paths to the default locale (fa).
// The root path "/" is handled by app/page.jsx (which also respects a saved
// language), so we skip it here and only rewrite deeper locale-less paths
// like /catalog → /fa/catalog.
import { NextResponse } from "next/server";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";
import { OP_COOKIE } from "@/lib/operator/session";

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // ── Operator panel: internal, single-locale, cookie-gated. Handled BEFORE the
  //    locale rewrite so /operator never becomes /fa/operator. The (panel) layout
  //    does the authoritative cryptographic session check on the Node server; here
  //    we only do a cheap presence redirect (needs no secret at the edge).
  if (pathname === "/operator" || pathname.startsWith("/operator/")) {
    if (pathname.startsWith("/operator/login")) return;
    const hasCookie = Boolean(req.cookies.get(OP_COOKIE)?.value);
    if (!hasCookie) {
      const url = req.nextUrl.clone();
      url.pathname = "/operator/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return;
  }

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
