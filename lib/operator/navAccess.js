// lib/operator/navAccess.js — which panel addresses a person may open, in one place: the menu, the start page and the pinned shortcuts all ask HERE
// (every page and action still checks again on the server). Plain module: unit-tested.
import { mayView, mayGlobal } from "./access.js";
import { tr } from "../panel/i18n.js";

const prefixOf = (panel) => (panel === "beauty" ? "/beauty/operator" : "/operator");

// [path under the panel root, label, icon, who may open it]. "" is the dashboard. `any` = one of several rights is enough.
const TARGETS = [
  ["", tr("داشبورد"), "dashboard", () => true],
  ["/products", tr("محصولات"), "package", (m) => m("products.view")],
  ["/categories", tr("دسته‌بندی‌ها"), "layers", (m) => m("categories.view") || m("products.view")],
  ["/brands", tr("برندها"), "badgeCheck", (m, p) => p === "beauty" && (m("brands.view") || m("products.view"))],
  ["/media", tr("تصاویر"), "image", (m) => m("media.view")],
  ["/quotes", tr("استعلام‌ها"), "quote", (m) => m("quotes.view")],
  ["/warehouse", tr("انبار"), "package", (m) => m("inventory.view")],
  ["/content", tr("محتوای سایت"), "edit", (m) => m("content.view")],
  ["/approvals", tr("تأییدها"), "check", (m, p, s) => Boolean(s?.user) && m("approvals.view")],
  ["/activity", tr("تاریخچه"), "clock", (m) => m("audit.view")],
  ["/users", tr("کاربران"), "user", (m, p, s) => mayGlobal(s, p, "users.view")],
  ["/settings", tr("تنظیمات"), "settings", () => true],
  ["/products/new", tr("افزودن محصول"), "plus", (m) => m("products.create")],            // a shortcut only, not a menu entry
];
export const SHORTCUT_ONLY = ["/products/new"];
export { SHORTCUT_LIMIT } from "./navLimits.js";

// → [{ href, label, icon }] the person may open (menu entries and shortcut-only entries), for ONE house
export function openableTargets(session, panel) {
  const root = prefixOf(panel);
  const m = (rel) => mayView(session, panel, rel);
  return TARGETS.filter(([, , , ok]) => ok(m, panel, session)).map(([path, label, icon]) => ({ href: root + path, label, icon }));
}

// the menu: everything openable except the shortcut-only entries
export const menuHrefs = (session, panel) => openableTargets(session, panel).map((x) => x.href).filter((h) => !SHORTCUT_ONLY.some((s) => h === prefixOf(panel) + s));
