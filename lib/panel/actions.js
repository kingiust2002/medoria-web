"use server";
// lib/panel/actions.js — remembers the chosen panel language. No session needed: it only stores a display preference
// (one of three fixed values) in a cookie, and the login pages use it too.
import { cookies } from "next/headers";
import { PANEL_LANG_COOKIE, isPanelLang } from "@/lib/panel/i18n";

export async function setPanelLang(lang) {
  if (!isPanelLang(lang)) return { ok: false };
  (await cookies()).set(PANEL_LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false, secure: process.env.NODE_ENV === "production" });
  return { ok: true };
}
