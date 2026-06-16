// middleware.js — vertical-first routing edge logic.
//   • "/"                      → gateway (app/page.jsx); never auto-forwarded.
//   • /operator…               → cookie-gated (unchanged).
//   • /health…  /beauty…       → pass through to the vertical trees.
//   • /tg, /tg/:path* (old)    → 301'd to /health/… by next.config redirects().
//   • any other locale-less    → /health/{default}/… (single hop, permanent).
import { NextResponse } from "next/server";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";
import { OP_COOKIE } from "@/lib/operator/session";

const PUBLIC_FILE = /\.(.*)$/;
const VERTICALS = ["health", "beauty"];

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // ── Operator panel: internal, single-locale, cookie-gated. Handled BEFORE any
  //    public routing so /operator never becomes a vertical path. The (panel)
  //    layout does the authoritative crypto session check on the Node server;
  //    here we only do a cheap presence redirect (needs no secret at the edge).
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

  const seg1 = pathname.split("/")[1];

  // Gateway, framework internals, the vertical trees, and static files: leave be.
  if (
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    VERTICALS.includes(seg1) ||
    seg1 === "test-gateway" || // TEMP: local scroll-gateway preview — remove with the test route
    PUBLIC_FILE.test(pathname)
  ) {
    return;
  }

  // Old locale-first URLs (/tg, /tg/:path*, …) are permanently redirected to
  // /health/… by next.config redirects(); don't double-handle them here.
  if (LOCALES.includes(seg1)) return;

  // Anything else locale-less and public → Medoria Health at the default locale
  // (single hop, permanent), preserving the path tail.
  const url = req.nextUrl.clone();
  url.pathname = `/health/${DEFAULT_LOCALE}${pathname}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
