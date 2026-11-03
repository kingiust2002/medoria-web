// lib/operator/accessCatalog.js — the access editor's vocabulary: which tick-boxes exist, what they are called, what each one really
// is in the permission model of lib/operator/authz.js, and how a set of ticks becomes the stored `allow` / `deny` lists and back.
// Pure (no Next, no database): the browser uses it to draw the editor and to show the summary before saving, the server and the tests use the
// SAME functions, so the screen and the rules cannot drift apart. The screen is a convenience; the server asks authz.checkUserChange again.
//
//   * every permission of authz.ALL_PERMISSIONS is in exactly one group (a test pins this) — nothing is hidden, nothing is invented;
//   * a tick means "this person can do it NOW": role default + extra grants − forbidden ones (effectivePermissions); unticking a thing the role gives
//     becomes an explicit `deny` (a deny beats the role), ticking a thing the role does not give becomes an `allow`; ticks equal to the role default store nothing;
//   * "direct" or "needs approval" exists only for operations in authz.APPROVABLE_OPERATIONS (a real filing action, reviewer and executor).
import { tr } from "../panel/i18n.js";
import { ALL_PERMISSIONS, HOUSES, OPERATIONS, ROLES, approvableFor, approvalList, decide, effectivePermissions, isValidRole } from "./authz.js";

// resource → [title, ...]; the action titles are shared
export const GROUPS = [
  { id: "products", title: tr("محصولات"), resources: ["products"] },
  { id: "categories", title: tr("دسته‌بندی‌ها"), resources: ["categories"] },
  { id: "brands", title: tr("برندها"), resources: ["brands"], houses: ["beauty"] },
  { id: "media", title: tr("تصاویر و رسانه"), resources: ["media"] },
  { id: "documents", title: tr("سندهای محصول"), resources: ["documents"] },
  { id: "quotes", title: tr("درخواست‌های مشتری"), resources: ["quotes", "customers"] },
  { id: "inventory", title: tr("انبار"), resources: ["inventory"] },
  { id: "content", title: tr("محتوای سایت"), resources: ["content"] },
  { id: "reports", title: tr("گزارش‌ها"), resources: ["reports"] },
  { id: "audit", title: tr("تاریخچه فعالیت"), resources: ["audit"] },
  { id: "approvals", title: tr("صف تأییدها"), resources: ["approvals"] },
];

// The clear operation titles: view, create, edit, edit price, archive, delete, publish, export, approve changes — and the rest of the house's own words.
const ACTION = {
  view: tr("مشاهده"), create: tr("ایجاد"), edit: tr("ویرایش"), price: tr("تغییر قیمت"), archive: tr("بایگانی"), delete: tr("حذف"), publish: tr("انتشار"),
  export: tr("خروجی گرفتن"), approve: tr("تأیید تغییرها"), rules: tr("تعیین قواعد انتشار"), assign: tr("ارجاع به مسئول"), merge: tr("ادغام پرونده‌ها"),
  receive: tr("ورود کالا"), issue: tr("خروج کالا"), transfer: tr("انتقال بین انبارها"), reserve: tr("رزرو موجودی"), adjust: tr("اصلاح موجودی"), count: tr("شمارش موجودی"),
  report: tr("گزارش انبار"), locations: tr("مدیریت انبارها"), quarantine: tr("قرنطینه و وضعیت بچ"), schedule: tr("زمان‌بندی انتشار"),
};
// where the plain action title is not enough because the resource says what the action acts on
const SPECIFIC = {
  "customers.view": tr("مشاهدهٔ پرونده مشتری"), "customers.edit": tr("ویرایش پرونده مشتری"), "customers.merge": tr("ادغام پرونده‌های مشتری"), "customers.export": tr("خروجی پرونده مشتری"),
  "quotes.edit": tr("ویرایش و تغییر وضعیت درخواست"), "audit.view": tr("مشاهدهٔ تاریخچه"), "audit.export": tr("خروجی تاریخچه"),
  "approvals.view": tr("مشاهدهٔ صف تأییدها"), "reports.view": tr("مشاهدهٔ گزارش‌ها"), "reports.export": tr("خروجی گزارش‌ها"),
  "users.view": tr("مشاهدهٔ کاربران"), "users.manage": tr("مدیریت کاربران"),
};
export const permissionTitle = (rel) => SPECIFIC[rel] || ACTION[rel.split(".")[1]] || rel;

// Only an owner can hand these out; nobody else may (authz.checkUserChange: `p === "users.manage" && !actorIsOwner`). Shown disabled with a reason.
export const NON_DELEGABLE = ["users.manage"];

const REL = (permission) => permission.split(".").slice(1).join(".");     // "health.products.edit" → "products.edit"

// → [{ id, title, resources: [{ resource, items: [{ rel, permission, title }] }] }] for ONE house. Items are in the order of authz.RESOURCES.
export function catalogFor(house) {
  const all = new Set(ALL_PERMISSIONS);
  return GROUPS.filter((g) => !g.houses || g.houses.includes(house)).map((g) => ({
    id: g.id, title: g.title,
    items: g.resources.flatMap((resource) => ALL_PERMISSIONS.filter((p) => p.startsWith(`${house}.${resource}.`) && all.has(p)).map((p) => ({ rel: REL(p), permission: p, title: permissionTitle(REL(p)) }))),
    operations: approvableFor(house).filter((op) => op.split(".")[0] === g.id).map((op) => ({ op, permission: `${house}.${OPERATIONS[op]}` })),
  }));
}
export const GLOBAL_ITEMS = [{ rel: "users.view", permission: "users.view", title: SPECIFIC["users.view"] }, { rel: "users.manage", permission: "users.manage", title: SPECIFIC["users.manage"] }];

// Every permission of the model has a place in the editor (so no stored grant is invisible on screen).
export function uncoveredPermissions() {
  const seen = new Set(GLOBAL_ITEMS.map((i) => i.permission));
  for (const h of HOUSES) for (const g of catalogFor(h)) for (const i of g.items) seen.add(i.permission);
  return ALL_PERMISSIONS.filter((p) => !seen.has(p));
}

// ── ticks ⇄ stored lists ──────────────────────────────────────────────────────────────────────────
// What the role alone gives (the "reset to role defaults" state), for the houses given.
export function roleDefaults({ role, houses }) {
  return new Set(effectivePermissions({ id: "x", status: "active", role, houses, allow: [], deny: [], approval: {} }));
}
// The state the editor starts from for an existing person: the set of permissions they can use now.
export const ticksOf = (user) => new Set(effectivePermissions({ ...user, status: "active" }));

// The stored `allow` / `deny` that give EXACTLY `ticks` on top of the role (only the differences from the role default are stored).
// Only permissions that exist in the person's houses (and the two global ones) are considered; `patterns` of the old representation are replaced.
export function listsFromTicks({ role, houses, ticks }) {
  const roleSet = roleDefaults({ role, houses });
  const scope = ALL_PERMISSIONS.filter((p) => p.startsWith("users.") || houses.some((h) => p.startsWith(`${h}.`)));
  const allow = [], deny = [];
  for (const p of scope) {
    const want = ticks.has(p), has = roleSet.has(p);
    const price = p.match(/^(\w+)\.products\.price$/);
    if (price) {
      // the price right follows the right to edit (authz.effectivePermissions): it is only ever stored as a deny — "can edit, but not change prices"
      if (!want && ticks.has(`${price[1]}.products.edit`)) deny.push(p);
      continue;
    }
    if (want && !has) allow.push(p);
    if (!want && has) deny.push(p);
  }
  return { allow, deny };
}

// ── what changes, in words ────────────────────────────────────────────────────────────────────────────
// before / after: user objects ({role, houses, allow, deny, approval}).
// → { added: [permission], removed: [permission], modes: [{ house, op, from, to }], houses: {added, removed}, roleChanged, empty }
export function diffAccess(before, after) {
  const a = ticksOf(before), b = ticksOf(after);
  const added = [...b].filter((p) => !a.has(p)).sort(), removed = [...a].filter((p) => !b.has(p)).sort();
  const modes = [];
  for (const h of HOUSES) {
    if (!(before.houses || []).includes(h) || !(after.houses || []).includes(h)) continue;      // a house gained or lost shows as houses, not as thirty mode lines
    for (const op of approvableFor(h)) {
      const from = decide({ ...before, status: "active" }, h, op).mode, to = decide({ ...after, status: "active" }, h, op).mode;
      if (from !== to && from !== "denied" && to !== "denied") modes.push({ house: h, op, from, to });   // direct ⇄ needs approval (granting / removing the right itself is in added / removed)
    }
  }
  const was = new Set(before.houses || []), now = new Set(after.houses || []);
  const housesDiff = { added: [...now].filter((h) => !was.has(h)), removed: [...was].filter((h) => !now.has(h)) };
  return {
    added, removed, modes, houses: housesDiff, roleChanged: before.role !== after.role,
    empty: !added.length && !removed.length && !modes.length && !housesDiff.added.length && !housesDiff.removed.length && before.role === after.role,
  };
}

// "health.products.price" → { house: "health", group: "محصولات", title: "تغییر قیمت" } (the words of the summary before saving); users.* have no house
export function describePermission(permission) {
  const [first] = permission.split(".");
  if (first === "users") return { house: null, group: tr("کاربران"), title: SPECIFIC[permission] || permission };
  const rel = REL(permission), resource = rel.split(".")[0];
  const group = GROUPS.find((g) => g.resources.includes(resource));
  return { house: first, group: group ? group.title : resource, title: permissionTitle(rel) };
}

// short, safe codes for the history (lib/operator/security.js sanitizeDetail keeps only /^[a-z_]{1,40}$/ strings): "health.products.edit" → "health_products_edit"
export const codeOf = (permission) => permission.replace(/\./g, "_");

export { approvalList, isValidRole, ROLES };
