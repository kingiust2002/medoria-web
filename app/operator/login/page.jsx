// app/operator/login/page.jsx — this direct URL is retired. The Health
// login form now lives at /login/health, reachable only through /login
// (the panel chooser) — never by typing this old path directly. Middleware
// already redirects here at the edge; this stub is a defense-in-depth
// fallback in case that's ever bypassed (same belt-and-suspenders pattern
// as the (panel) layout's own session check).
import { redirect } from "next/navigation";

export default function RetiredHealthLoginPage() {
  redirect("/login");
}
