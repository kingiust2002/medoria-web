
import { tr } from "../panel/i18n.js";
// lib/operator/authz.js — who may do what in the operator panels. PURE: no database, no Next.js, no environment; every rule of
// docs/PANEL_PLATFORM_PLAN.md D3/D4 lives here so it can be tested exhaustively, and every server action asks THIS module.
//
// A permission is `house.resource.action` ("health.products.edit"); the only global ones are `users.view` and `users.manage`.
//   * DEFAULT CLOSED: nothing is allowed unless a role or an explicit `allow` grants it.
//   * An explicit `deny` beats everything (allow, role, owner). Owner is not exempt from his own deny.
//   * A user only acts in the houses listed on his account; Health and Beauty never mix.
//   * A user who is not `active` can do nothing.
//   * Nobody raises his own role, houses, permissions or approval policy; nobody grants a permission he does not hold; only an
//     owner creates or changes an owner; the last active owner can never be disabled, blocked, demoted or have houses removed.
//   * What needs APPROVAL is a per-user, per-operation list (not one switch): `decide()` answers direct | approval | denied.

export const HOUSES = ["health", "beauty"];

// resource -> actions. Beauty has brands, Health has none (see HOUSE_RESOURCES).
export const RESOURCES = {
  products:   ["view", "create", "edit", "archive", "delete", "publish", "approve", "export"],
  categories: ["view", "create", "edit", "archive", "delete", "publish", "approve", "export"],
  brands:     ["view", "create", "edit", "archive", "delete", "publish", "approve", "export"],
  media:      ["view", "create", "edit", "delete", "approve"],       // approve: a request to delete a file could never be decided without it
  documents:  ["view", "create", "edit", "archive", "delete", "publish", "approve"],
  quotes:     ["view", "edit", "assign", "archive", "delete", "export", "approve"],
  customers:  ["view", "edit", "merge", "export"],
  inventory:  ["view", "receive", "issue", "transfer", "reserve", "adjust", "count", "approve", "report", "export", "locations", "quarantine"],
  content:    ["view", "create", "edit", "publish", "schedule", "approve"],
  reports:    ["view", "export"],
  audit:      ["view", "export"],
  approvals:  ["view"],
};
const HOUSE_RESOURCES = { health: Object.keys(RESOURCES).filter((r) => r !== "brands"), beauty: Object.keys(RESOURCES) };
export const GLOBAL_PERMISSIONS = ["users.view", "users.manage"];

export const ALL_PERMISSIONS = [
  ...HOUSES.flatMap((h) => HOUSE_RESOURCES[h].flatMap((r) => RESOURCES[r].map((a) => `${h}.${r}.${a}`))),
  ...GLOBAL_PERMISSIONS,
];
const PERMISSION_SET = new Set(ALL_PERMISSIONS);
export const isValidPermission = (p) => typeof p === "string" && PERMISSION_SET.has(p);

// ── patterns: "*" matches one segment, a trailing "*" alone matches everything ───────────────────────────────────────────
function matches(pattern, permission) {
  if (pattern === "*") return true;
  const p = pattern.split("."), q = permission.split(".");
  if (p[p.length - 1] === "*" && p.length < q.length) {      // a trailing "*" stands for the whole rest: "beauty.*" = everything of Beauty
    return p.slice(0, -1).every((seg, i) => seg === "*" || seg === q[i]);
  }
  if (p.length !== q.length) return false;
  return p.every((seg, i) => seg === "*" || seg === q[i]);
}
export function expandPattern(pattern) {
  return ALL_PERMISSIONS.filter((p) => matches(pattern, p));
}
export const isValidPattern = (p) => typeof p === "string" && /^[a-z*]+(\.[a-z_*]+){0,2}$/.test(p) && expandPattern(p).length > 0;

// ── roles: house-relative presets ("products.edit" is granted in each house the user belongs to) ──────────────────────────
export const ROLES = {
  owner: { label: tr("مدیر اصلی"), all: true, perms: [], approval: [] },
  house_admin: {
    label: tr("مدیر بخش"),
    perms: ["products.*", "categories.*", "brands.*", "media.*", "documents.*", "quotes.*", "customers.*", "inventory.*", "content.*", "reports.*", "audit.*", "approvals.*", "users.view"],
    approval: [],
  },
  product_manager: {
    label: tr("مسئول محصول"),
    perms: ["products.view", "products.create", "products.edit", "products.archive", "products.export", "categories.view", "categories.create", "categories.edit", "brands.view", "brands.create", "brands.edit",
      "media.view", "media.create", "media.edit", "documents.view", "documents.create", "documents.edit", "content.view", "approvals.view",
      // allowed in principle but sent for approval by default (the per-person list can make any of them direct)
      "products.publish", "products.delete", "categories.delete", "media.delete"],
    approval: ["products.price", "products.publish", "products.delete", "categories.delete", "media.delete"],
  },
  quote_manager: {
    label: tr("مسئول درخواست‌ها"),
    perms: ["quotes.view", "quotes.edit", "quotes.assign", "quotes.archive", "customers.view", "reports.view", "approvals.view", "quotes.delete", "quotes.export"],
    approval: ["quotes.delete"],             // an export is a file for the person who asked: there is nothing to approve afterwards
  },
  warehouse_manager: {
    label: tr("مسئول انبار"),
    perms: ["inventory.view", "inventory.receive", "inventory.issue", "inventory.transfer", "inventory.reserve", "inventory.adjust", "inventory.count", "inventory.report", "inventory.locations", "inventory.quarantine", "products.view", "approvals.view"],
    approval: ["inventory.adjust", "inventory.count_close"],
  },
  viewer: {
    label: tr("فقط‌خواندنی"),
    perms: ["products.view", "categories.view", "brands.view", "media.view", "documents.view", "content.view", "quotes.view", "reports.view"],
    approval: [],
  },
};
export const ROLE_IDS = Object.keys(ROLES);
export const isValidRole = (r) => Object.prototype.hasOwnProperty.call(ROLES, r);

function roleGrants(role, houses) {
  const def = ROLES[role];
  if (!def) return new Set();
  if (def.all) return new Set(ALL_PERMISSIONS);
  const out = new Set();
  for (const rel of def.perms) {
    if (rel.startsWith("users.")) { if (matches(rel, rel) && isValidPermission(rel)) out.add(rel); continue; }
    for (const h of houses) for (const p of expandPattern(`${h}.${rel}`)) out.add(p);
  }
  return out;
}

// ── operations: what a change IS, so approval can be decided per kind of change ────────────────────────────────────────
// op -> the permission that is needed to do it or to ASK for it. Whether it then runs at once or waits is the user's policy.
export const OPERATIONS = {
  "products.create": "products.create", "products.content": "products.edit", "products.price": "products.edit", "products.stock_flag": "products.edit",
  "products.publish": "products.publish", "products.archive": "products.archive", "products.delete": "products.delete", "products.bulk": "products.edit",
  "products.import": "products.create", "products.restore_version": "products.edit", "products.export": "products.export",
  "categories.create": "categories.create", "categories.edit": "categories.edit", "categories.archive": "categories.archive", "categories.delete": "categories.delete",
  "brands.create": "brands.create", "brands.edit": "brands.edit", "brands.archive": "brands.archive", "brands.delete": "brands.delete",
  "media.upload": "media.create", "media.edit": "media.edit", "media.delete": "media.delete",
  "documents.edit": "documents.edit", "documents.publish": "documents.publish", "documents.delete": "documents.delete",
  "quotes.status": "quotes.edit", "quotes.assign": "quotes.assign", "quotes.delete": "quotes.delete", "quotes.export": "quotes.export",
  "inventory.receive": "inventory.receive", "inventory.issue": "inventory.issue", "inventory.transfer": "inventory.transfer",
  "inventory.reserve": "inventory.reserve", "inventory.adjust": "inventory.adjust", "inventory.count_start": "inventory.count", "inventory.count_close": "inventory.count", "inventory.locations": "inventory.locations",
  "inventory.level": "inventory.locations", "inventory.export": "inventory.export", "inventory.lot_status": "inventory.quarantine",
  "content.create": "content.create", "content.edit": "content.edit", "content.publish": "content.publish", "content.schedule": "content.schedule", "content.delete": "content.publish",
};
export const OPERATION_IDS = Object.keys(OPERATIONS);
export const isValidOperation = (o) => Object.prototype.hasOwnProperty.call(OPERATIONS, o);

// ── which operations can REALLY go through the approval queue ────────────────────────────────────────────────────────────
// "Needs approval" is only a promise if an action files the request AND an executor applies it after a reviewer says yes. These are the
// operations for which both exist (tests/approval-registry.test.mjs proves it, for both houses). Everything else has no approval mode:
// it is never offered as one, an account change that asks for it is refused, and a stored policy that still lists it is treated as
// CLOSED (denied) — never as a button that cannot work.
export const APPROVABLE_OPERATIONS = [
  "products.create", "products.content", "products.price", "products.stock_flag", "products.publish", "products.archive", "products.delete", "products.restore_version",
  "categories.delete", "brands.delete", "media.delete", "quotes.delete", "inventory.adjust", "inventory.count_close",
];
const APPROVABLE_SET = new Set(APPROVABLE_OPERATIONS);
export const isApprovable = (op) => APPROVABLE_SET.has(op);
// the operations a person can be asked to get approved in this house (Health has no brands)
export const approvableFor = (house) => APPROVABLE_OPERATIONS.filter((op) => house === "beauty" || !op.startsWith("brands."));

// ── the user shape this module understands ──────────────────────────────────────────────────────────────────────────────
// { id, status: "active"|"disabled"|"blocked", role, houses: ["health","beauty"], allow: [pattern], deny: [pattern],
//   approval: { health: [op], beauty: [op] } }   — `approval` missing for a house means: the role's default list.
const activeHouses = (u) => (u && u.status === "active" && Array.isArray(u.houses) ? u.houses.filter((h) => HOUSES.includes(h)) : []);

export function effectivePermissions(user) {
  const houses = activeHouses(user);
  if (!user || user.status !== "active" || !isValidRole(user.role)) return new Set();
  const out = new Set();
  const inScope = (p) => p.startsWith("users.") || houses.includes(p.split(".")[0]);
  for (const p of roleGrants(user.role, houses)) if (inScope(p)) out.add(p);
  for (const pat of user.allow || []) for (const p of isValidPattern(pat) ? expandPattern(pat) : []) if (inScope(p)) out.add(p);
  for (const pat of user.deny || []) if (isValidPattern(pat)) for (const p of expandPattern(pat)) out.delete(p);   // deny wins over role, allow and owner
  return out;
}

export function can(user, permission) {
  if (!isValidPermission(permission)) return false;           // an unknown permission is never granted
  return effectivePermissions(user).has(permission);
}

export const canInHouse = (user, house, resourceAction) => can(user, `${house}.${resourceAction}`);

// the operations of a house that this user must send for approval
export function approvalList(user, house) {
  if (user?.approval && Array.isArray(user.approval[house])) return user.approval[house].filter(isValidOperation);
  return (ROLES[user?.role]?.approval || []).filter(isValidOperation);
}

// → { mode: "direct" | "approval" | "denied", permission }
export function decide(user, house, operation) {
  const rel = OPERATIONS[operation];
  if (!rel || !HOUSES.includes(house)) return { mode: "denied", permission: null };
  const permission = `${house}.${rel}`;
  if (!can(user, permission)) return { mode: "denied", permission };
  if (!approvalList(user, house).includes(operation)) return { mode: "direct", permission };
  // listed for approval: only an operation that can really be approved gets that mode; otherwise the door stays shut
  return isApprovable(operation) ? { mode: "approval", permission } : { mode: "denied", permission, reason: "approval_unsupported" };
}

// Reviewing someone else's change: the reviewer needs the resource's approve permission and the queue, never his own change.
export function canReview(reviewer, requesterId, house, resource) {
  if (!reviewer || reviewer.id === requesterId) return false;
  return can(reviewer, `${house}.approvals.view`) && can(reviewer, `${house}.${resource}.approve`);
}

// ── execution modes as a ceiling ─────────────────────────────────────────────────────────────────────────────────────────
// "denied" < "approval" < "direct". Whoever manages accounts may never hand out, or touch, more execution power than they hold themselves:
// an account whose price change needs approval cannot create an account that changes prices directly.
const MODE_RANK = { denied: 0, approval: 1, direct: 2 };
export function modeRanks(user) {
  const out = new Map();
  for (const h of activeHouses(user)) for (const op of OPERATION_IDS) out.set(`${h}:${op}`, MODE_RANK[decide({ ...user, status: "active" }, h, op).mode]);
  return out;
}
// the (house, operation) pairs where `after` is more permissive than both `before` and the actor
export function modesAboveActor(actor, before, after) {
  const a = modeRanks(actor), b = modeRanks({ ...before, status: "active" }), c = modeRanks({ ...after, status: "active" });
  const out = [];
  for (const [k, rank] of c) if (rank > (b.get(k) ?? 0) && rank > (a.get(k) ?? 0)) out.push(k);
  return out;
}
// May a non-owner actor manage this EXISTING target at all (password reset, sessions, status, any change)? Only if nothing the target can do
// (permissions, execution modes, houses) exceeds the actor's own authority. The owner role is handled separately.
export function targetWithinActor(actor, target) {
  const mine = effectivePermissions(actor);
  if ([...effectivePermissions({ ...target, status: "active" })].some((p) => !mine.has(p))) return false;
  const a = modeRanks(actor);
  for (const [k, rank] of modeRanks({ ...target, status: "active" })) if (rank > (a.get(k) ?? 0)) return false;
  return true;
}

// ── managing accounts ──────────────────────────────────────────────────────────────────────────────────────────────────
const activeOwners = (users) => users.filter((u) => u.status === "active" && u.role === "owner");

// `change` is the new state of the target: { role, houses, allow, deny, approval, status } (missing keys = unchanged).
// → { ok, errors: [code] }. Codes are stable (tests and UI use them).
export function checkUserChange({ actor, target, change, users = [] }) {
  const errors = [];
  const isNew = !target;
  const before = target || { id: null, status: "active", role: "viewer", houses: [], allow: [], deny: [], approval: {} };
  const after = { ...before, ...change };
  if (!actor || !can(actor, "users.manage")) return { ok: false, errors: ["not_allowed"] };

  if (!isNew && actor.id === before.id) {
    // nobody edits his own power; password, 2FA and display name are handled by the self-service paths
    for (const k of ["role", "houses", "allow", "deny", "approval", "status", "require2fa"]) {
      if (change[k] !== undefined && JSON.stringify(change[k]) !== JSON.stringify(before[k])) errors.push(`self_${k}`);
    }
    return { ok: errors.length === 0, errors };
  }

  if (change.role !== undefined && !isValidRole(change.role)) errors.push("bad_role");
  if (change.houses !== undefined && (!Array.isArray(change.houses) || !change.houses.length || !change.houses.every((h) => HOUSES.includes(h)))) errors.push("bad_houses");
  for (const k of ["allow", "deny"]) if (change[k] !== undefined && (!Array.isArray(change[k]) || !change[k].every(isValidPattern))) errors.push(`bad_${k}`);
  if (change.status !== undefined && !["active", "disabled", "blocked"].includes(change.status)) errors.push("bad_status");
  if (change.approval !== undefined) {
    const ok = change.approval && typeof change.approval === "object" && Object.entries(change.approval).every(([h, ops]) => HOUSES.includes(h) && Array.isArray(ops) && ops.every(isValidOperation));
    if (!ok) errors.push("bad_approval");
    // an operation that cannot be sent for approval is not an option: saving it would promise something the system cannot do
    else if (Object.entries(change.approval).some(([h, ops]) => ops.some((op) => !approvableFor(h).includes(op)))) errors.push("approval_unsupported");
  }
  if (errors.length) return { ok: false, errors };

  // an owner is an owner of the whole house: both Health and Beauty (the database trigger relies on it)
  if (after.role === "owner" && !HOUSES.every((h) => (after.houses || []).includes(h))) errors.push("owner_needs_both_houses");

  // only an owner creates or touches an owner
  const actorIsOwner = actor.role === "owner";
  if (!actorIsOwner && (after.role === "owner" || before.role === "owner")) errors.push("owner_only");

  // houses: the actor can only give or take houses he is in himself
  const actorHouses = activeHouses(actor);
  if (!actorIsOwner) {
    const changed = [...new Set([...(after.houses || []), ...(before.houses || [])])].filter((h) => !((after.houses || []).includes(h) && (before.houses || []).includes(h)));
    if (changed.some((h) => !actorHouses.includes(h))) errors.push("house_outside_actor");
    if ((before.houses || []).some((h) => !actorHouses.includes(h))) errors.push("target_outside_actor");
  }

  // an existing target who can do more than the actor is not the actor's to manage (reset, sessions, status, anything)
  if (!actorIsOwner && !isNew && !targetWithinActor(actor, before)) errors.push("target_above_actor");
  // the second-factor requirement is a security policy: only an owner relaxes it
  if (!actorIsOwner && change.require2fa !== undefined && !change.require2fa && before.require2fa) errors.push("require2fa_owner_only");

  // grant ceiling: every permission the target GAINS must be one the actor holds
  const gained = [...effectivePermissions({ ...after, status: "active" })].filter((p) => !effectivePermissions({ ...before, status: "active" }).has(p));
  if (gained.some((p) => !can(actor, p) || (p === "users.manage" && !actorIsOwner))) errors.push("grant_above_actor");
  // …and so must every execution MODE: no "direct" where the actor themself needs approval
  if (!actorIsOwner && modesAboveActor(actor, before, after).length) errors.push("mode_above_actor");

  // the last active owner stays
  if (before.role === "owner" && before.status === "active") {
    const stillOwner = after.role === "owner" && after.status === "active" && HOUSES.every((h) => (after.houses || []).includes(h));
    if (!stillOwner && activeOwners(users).filter((u) => u.id !== before.id).length === 0) errors.push("last_owner");
  }
  return { ok: errors.length === 0, errors };
}

// Deleting is not offered at all: accounts are disabled, never erased (history must stay attributable).
export const canEraseUser = () => false;

// What must happen to the sessions of a user after a change (D2): nothing, or all of them end.
export function sessionPolicy(before, after, { passwordChanged = false, twoFactorChanged = false } = {}) {
  if (passwordChanged || twoFactorChanged) return "end_all";
  if (after.status !== "active") return "end_all";
  if (Boolean(before.require2fa) !== Boolean(after.require2fa)) return "end_all";       // the second-factor requirement changed: sign in again under the new rule
  for (const k of ["role", "houses", "allow", "deny"]) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) return "end_all";
  if (JSON.stringify(before.approval || {}) !== JSON.stringify(after.approval || {})) return "refresh";
  return "none";
}
