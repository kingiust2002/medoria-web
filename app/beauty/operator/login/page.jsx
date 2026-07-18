// app/beauty/operator/login/page.jsx — this direct URL is retired. The
// Beauty login form now lives at /login/beauty, reachable only through
// /login (the panel chooser) — never by typing this old path directly.
// Middleware already redirects here at the edge; this stub is a
// defense-in-depth fallback in case that's ever bypassed.
import { redirect } from "next/navigation";

export default function RetiredBeautyLoginPage() {
  redirect("/login");
}
