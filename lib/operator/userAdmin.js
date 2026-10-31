// lib/operator/userAdmin.js — the rules of the "people" screen that are not database work: who is visible to whom, how a typed
// permission list is read, how a temporary password is made, and the stable messages. Plain module (no Next imports), unit-tested.
import { randomInt } from "node:crypto";
import { HOUSES, isValidPattern, isValidOperation } from "./authz.js";
import { ACCOUNT_MESSAGES } from "./accounts.js";
import { passwordProblem } from "./passwords.js";
import { tr } from "../panel/i18n.js";

// An owner sees everybody; anybody else sees only people who share at least one of his own houses. (A person you cannot see you cannot
// change: authz.checkUserChange refuses the same cases again on the server.)
export function visibleUsers(actor, users) {
  if (!actor) return [];
  if (actor.role === "owner") return users;
  const mine = new Set(actor.houses || []);
  return users.filter((u) => (u.houses || []).some((h) => mine.has(h)));
}
export const canSee = (actor, target) => visibleUsers(actor, [target]).length === 1;

// A line-per-pattern textarea → clean list. Invalid lines are returned separately so the screen can say which.
export function parsePatterns(text) {
  const lines = String(text ?? "").split(/[\n,]+/).map((l) => l.trim().toLowerCase()).filter(Boolean);
  const ok = [], bad = [];
  for (const l of [...new Set(lines)]) (isValidPattern(l) ? ok : bad).push(l);
  return { patterns: ok.slice(0, 100), invalid: bad.slice(0, 20) };
}

// { health: [op…], beauty: [op…] } with only known houses and operations. `null` for a house = "the role's default list".
export function cleanApproval(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const h of HOUSES) {
    if (Array.isArray(input[h])) out[h] = [...new Set(input[h].filter(isValidOperation))];
  }
  return out;
}

export function cleanHouses(input) {
  return HOUSES.filter((h) => Array.isArray(input) && input.includes(h));
}

// A temporary password for a new person or a reset: 20 characters without look-alikes, always passes the policy. Shown once.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateTempPassword() {
  for (;;) {
    let s = "";
    for (let i = 0; i < 20; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    if (/[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s) && !passwordProblem(s)) return s;
  }
}

export const USER_MESSAGES = {
  ...ACCOUNT_MESSAGES,
  password: {
    too_short: tr("رمز عبور کوتاه است (حداقل ۱۲ نویسه)."),
    too_long: tr("رمز عبور بیش از حد طولانی است."),
    too_common: tr("این رمز عبور بیش از حد رایج است."),
    contains_username: tr("رمز عبور نباید شامل نام کاربری باشد."),
    contains_name: tr("رمز عبور نباید شامل نام نمایشی باشد."),
    too_uniform: tr("رمز عبور بیش از حد تکراری است."),
    needs_letter_and_digit: tr("رمز عبور باید حرف و عدد داشته باشد (یا حداقل ۱۶ نویسه باشد)."),
    bad_type: tr("رمز عبور نامعتبر است."),
  },
  authz: {
    not_allowed: tr("اجازهٔ مدیریت کاربران را ندارید."),
    owner_only: tr("فقط مدیر اصلی می‌تواند مدیر اصلی بسازد یا او را تغییر دهد."),
    owner_needs_both_houses: tr("مدیر اصلی باید هر دو بخش (سلامت و زیبایی) را داشته باشد."),
    house_outside_actor: tr("نمی‌توانید بخشی را بدهید که خودتان در آن نیستید."),
    target_outside_actor: tr("این کاربر به بخشی دسترسی دارد که شما ندارید."),
    grant_above_actor: tr("نمی‌توانید دسترسی‌ای را بدهید که خودتان ندارید."),
    mode_above_actor: tr("نمی‌توانید اجرای مستقیمِ کاری را بدهید که خودتان باید برایش تأیید بگیرید."),
    target_above_actor: tr("این کاربر کارهایی می‌تواند بکند که شما نمی‌توانید؛ مدیریت او با شما نیست."),
    approval_unsupported: tr("برای بعضی از کارهای انتخاب‌شده، «نیازمند تأیید» ساخته نشده است؛ فقط کارهای فهرست‌شده قابل ارجاع به تأیید هستند."),
    require2fa_owner_only: tr("برداشتن الزام ورود دومرحله‌ای فقط با مدیر اصلی است."),
    self_require2fa: tr("الزام ورود دومرحله‌ای خودتان را نمی‌توانید تغییر دهید."),
    last_owner: tr("آخرین مدیر اصلی فعال را نمی‌شود غیرفعال، مسدود یا تنزل داد."),
    bad_role: tr("نقش نامعتبر است."),
    bad_houses: tr("حداقل یک بخش لازم است."),
    bad_allow: tr("فهرست مجوزهای اضافه نامعتبر است."),
    bad_deny: tr("فهرست مجوزهای ممنوع نامعتبر است."),
    bad_status: tr("وضعیت نامعتبر است."),
    bad_approval: tr("سیاست تأیید نامعتبر است."),
    self_role: tr("نقش خودتان را نمی‌توانید تغییر دهید."),
    self_houses: tr("بخش‌های خودتان را نمی‌توانید تغییر دهید."),
    self_allow: tr("دسترسی‌های خودتان را نمی‌توانید تغییر دهید."),
    self_deny: tr("دسترسی‌های خودتان را نمی‌توانید تغییر دهید."),
    self_approval: tr("سیاست تأیید خودتان را نمی‌توانید تغییر دهید."),
    self_status: tr("حساب خودتان را نمی‌توانید غیرفعال کنید."),
  },
};

// One sentence for a store result that failed. Messages stay Persian here and are translated by the screen (tr / t).
export function messageFor(result) {
  if (!result || result.ok) return null;
  if (result.error === "password") return USER_MESSAGES.password[result.problem] || USER_MESSAGES.password.bad_type;
  if (result.codes?.length) {
    const first = result.codes.find((c) => USER_MESSAGES.authz[c]);
    if (first) return USER_MESSAGES.authz[first];
  }
  return USER_MESSAGES[result.error] || USER_MESSAGES.failed;
}

