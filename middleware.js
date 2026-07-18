// middleware.js — vertical-first routing edge logic.
//   • "/"                      → gateway (app/page.jsx); never auto-forwarded.
//   • /operator…  /beauty/operator…  → cookie-gated, own login each.
//   • /health…  /beauty…       → pass through to the vertical trees.
//   • /tg, /tg/:path* (old)    → 301'd to /health/… by next.config redirects().
//   • any other locale-less    → /health/{default}/… (single hop, permanent).
import { NextResponse } from "next/server";
import { LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";
import { OP_COOKIE } from "@/lib/operator/session";
import { BOP_COOKIE } from "@/lib/beauty/operator/session";

const PUBLIC_FILE = /\.(.*)$/;
const VERTICALS = ["health", "beauty"];

// The old direct login URLs are retired — the ONLY door in is /login (the
// panel chooser), which then sends the visitor to /login/health or
// /login/beauty. Typing the bare panel path directly bounces back to /login
// rather than ever rendering a form, for both the panel root and its old
// /login sub-path (defense-in-depth: the page stubs there redirect too).
function gateOperatorPath({ req, pathname, base, cookieName }) {
  if (pathname === `${base}/login` || pathname.startsWith(`${base}/login/`)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const hasCookie = Boolean(req.cookies.get(cookieName)?.value);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = base === "/operator" ? "/login/health" : "/login/beauty";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return null;
}

export function middleware(req) {
  const { pathname } = req.nextUrl;

  // ── Operator panels: internal, single-locale, cookie-gated. Handled BEFORE
  //    any public routing so neither one ever becomes a vertical path. Each
  //    (panel) layout does the authoritative crypto session check on the
  //    Node server; here we only do a cheap presence redirect (no secret
  //    needed at the edge).
  if (pathname === "/operator" || pathname.startsWith("/operator/")) {
    const res = gateOperatorPath({ req, pathname, base: "/operator", cookieName: OP_COOKIE });
    return res || undefined;
  }
  if (pathname === "/beauty/operator" || pathname.startsWith("/beauty/operator/")) {
    const res = gateOperatorPath({ req, pathname, base: "/beauty/operator", cookieName: BOP_COOKIE });
    return res || undefined;
  }

  // ── /login: neutral admin entry point (choose Health vs Beauty panel).
  //    Single-locale, no auth of its own — just leave it alone, same as the
  //    operator panels, so it never becomes a vertical path either.
  if (pathname === "/login" || pathname.startsWith("/login/")) return;

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
