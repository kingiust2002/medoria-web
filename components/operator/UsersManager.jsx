"use client";
// The people screen, shared by the Health and the Beauty panel (each passes its own server actions). Create a person, change role /
// houses / status / second-factor requirement / extra and forbidden permissions / approval policy, give a new temporary password
// (shown once), end someone's sessions. The convenience only: every rule is checked again on the server (lib/operator/authz.js).
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Badge, EmptyState, Field, Input, Select, SectionCard, Spinner, Textarea, Toggle } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { formatDate, tr } from "@/lib/panel/i18n";
import { HOUSES, ROLES } from "@/lib/operator/authz";
import { OPERATION_CHOICES, OPERATION_LABELS } from "@/lib/operator/userLabels";

const HOUSE_LABEL = { health: tr("سلامت"), beauty: tr("زیبایی") };
const STATUS_LABEL = { active: tr("فعال"), disabled: tr("غیرفعال"), blocked: tr("مسدود") };
const STATUS_TONE = { active: "ok", disabled: "neutral", blocked: "warn" };
const opsOf = (house) => OPERATION_CHOICES.filter((op) => house === "beauty" || !op.startsWith("brands."));

function emptyForm(actor) {
  return { username: "", displayName: "", role: "viewer", houses: actor.role === "owner" ? [] : [...actor.houses], require2fa: true, status: "active", allowText: "", denyText: "", custom: {}, approval: {} };
}
function formFrom(user) {
  const custom = {}, approval = {};
  for (const h of HOUSES) if (Array.isArray(user.approval?.[h])) { custom[h] = true; approval[h] = [...user.approval[h]]; }
  return { username: user.username, displayName: user.displayName, role: user.role, houses: [...user.houses], require2fa: user.require2fa, status: user.status, allowText: user.allow.join("\n"), denyText: user.deny.join("\n"), custom, approval };
}

export default function UsersManager({ users, loadError, canManage, actor, panel, actions }) {
  const t = useT();
  const { lang } = usePanelLang();
  const router = useRouter();
  const [dialog, setDialog] = useState(null);          // { mode: "create" } | { mode: "edit", user }
  const [secret, setSecret] = useState(null);          // { who, password } — shown once
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const after = (res, okText) => {
    if (res?.ok) { setNotice(okText); router.refresh(); return true; }
    setNotice(t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."));
    if (res?.conflict) router.refresh();
    return false;
  };

  async function reset(user) {
    if (!window.confirm(t("رمز عبور «{name}» عوض شود؟ همهٔ نشست‌های او بسته می‌شود.", { name: user.displayName }))) return;
    setBusyId(user.id);
    const res = await actions.resetPersonPassword(user.id).catch(() => null);
    setBusyId("");
    if (res?.ok) { setSecret({ who: user.displayName, password: res.tempPassword }); setNotice(""); router.refresh(); } else after(res, "");
  }
  async function endSessions(user) {
    setBusyId(user.id);
    const res = await actions.endPersonSessions(user.id).catch(() => null);
    setBusyId("");
    after(res, t("نشست‌های «{name}» بسته شد.", { name: user.displayName }));
  }

  return (
    <div className="grid gap-4">
      {loadError && <div role="alert" className="card p-4 text-sm text-warn">{t(loadError)}</div>}
      {notice && <div role="status" className="card p-3 text-sm text-ink-soft flex items-start justify-between gap-3"><span className="min-w-0 break-words">{notice}</span><button type="button" onClick={() => setNotice("")} aria-label={t("بستن")} className="text-ink-muted shrink-0"><Icon name="close" size={16} /></button></div>}
      {secret && <TempPassword secret={secret} onClose={() => setSecret(null)} />}

      {canManage && (
        <div className="flex justify-end">
          <button type="button" className="btn-primary size-md" onClick={() => setDialog({ mode: "create" })}><Icon name="plus" size={18} /> {t("کاربر تازه")}</button>
        </div>
      )}

      {users.length === 0 ? (
        <EmptyState icon="user" title={t("هنوز کاربری نیست")} desc={t("اولین کاربر را بسازید.")} />
      ) : (
        <ul className="grid gap-3" data-testid="people-list">
          {users.map((u) => (
            <li key={u.id} className="card p-4 flex flex-wrap items-start justify-between gap-3" data-testid="person">
              <div className="min-w-0">
                <p className="font-semibold text-ink break-words">{u.displayName}{u.id === actor.id && <span className="text-ink-faint font-normal"> · {t("شما")}</span>}</p>
                <p className="text-xs text-ink-muted break-all" dir="ltr">{u.username}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge tone={STATUS_TONE[u.status] || "neutral"}>{t(STATUS_LABEL[u.status] || u.status)}</Badge>
                  <Badge tone="violet">{t(ROLES[u.role]?.label || u.role)}</Badge>
                  {u.houses.map((h) => <Badge key={h} tone="info">{t(HOUSE_LABEL[h] || h)}</Badge>)}
                  <Badge tone={u.hasTotp ? "ok" : u.require2fa ? "warn" : "neutral"}>{u.hasTotp ? t("ورود دومرحله‌ای فعال") : u.require2fa ? t("ورود دومرحله‌ای لازم، هنوز راه‌اندازی نشده") : t("بدون ورود دومرحله‌ای")}</Badge>
                </div>
                <p className="text-[11px] text-ink-faint mt-2">{u.lastLoginAt ? t("آخرین ورود: {date}", { date: formatDate(lang, u.lastLoginAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) }) : t("هنوز وارد نشده")}</p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => setDialog({ mode: "edit", user: u })}><Icon name="edit" size={14} /> {t("ویرایش")}</button>
                  {u.id !== actor.id && <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => reset(u)}><Icon name="lock" size={14} /> {t("رمز موقت")}</button>}
                  <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => endSessions(u)}>{busyId === u.id ? <Spinner size={12} /> : <Icon name="logout" size={14} />} {t("بستن نشست‌ها")}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog && (
        <PersonDialog
          mode={dialog.mode} user={dialog.user} actor={actor} panel={panel} onClose={() => setDialog(null)}
          onSave={async (payload) => {
            const res = dialog.mode === "create" ? await actions.createPerson(payload).catch(() => null) : await actions.updatePerson(dialog.user.id, payload, dialog.user.version).catch(() => null);
            if (res?.ok) {
              setDialog(null); router.refresh();
              if (res.tempPassword) { setSecret({ who: res.user.displayName, password: res.tempPassword }); setNotice(""); }
              else setNotice(res.sessionsEnded ? t("ذخیره شد؛ نشست‌های این کاربر بسته شد.") : t("ذخیره شد."));
              return null;
            }
            if (res?.conflict) router.refresh();
            return t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید.");
          }}
        />
      )}
    </div>
  );
}

function TempPassword({ secret, onClose }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <SectionCard title={t("رمز موقت برای «{name}»", { name: secret.who })} icon="lock" desc={t("این رمز فقط یک بار نمایش داده می‌شود. آن را امن به او بدهید؛ در اولین ورود باید رمز خود را عوض کند.")}>
      <div className="flex flex-wrap items-center gap-3">
        <code dir="ltr" data-testid="temp-password" className="px-3 py-2 rounded-lg bg-line-soft text-ink font-mono text-sm break-all select-all">{secret.password}</code>
        <button type="button" className="btn-ghost size-sm" onClick={async () => { try { await navigator.clipboard.writeText(secret.password); setCopied(true); } catch { /* the text is selectable */ } }}>
          <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? t("کپی شد") : t("کپی")}
        </button>
        <button type="button" className="btn-ghost size-sm" onClick={onClose}>{t("بستن")}</button>
      </div>
    </SectionCard>
  );
}

function PersonDialog({ mode, user, actor, panel, onClose, onSave }) {
  const t = useT();
  const isOwner = actor.role === "owner";
  const editing = mode === "edit";
  const self = editing && user.id === actor.id;
  const [f, setF] = useState(() => (editing ? formFrom(user) : emptyForm(actor)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const grantable = isOwner ? HOUSES : actor.houses;
  const roles = Object.keys(ROLES).filter((r) => isOwner || r !== "owner");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleHouse = (h) => set("houses", f.houses.includes(h) ? f.houses.filter((x) => x !== h) : [...f.houses, h]);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr(""); setBusy(true);
    const approval = {};
    for (const h of f.houses) if (f.custom[h]) approval[h] = f.approval[h] || [];
    const payload = { displayName: f.displayName, require2fa: f.require2fa, allowText: f.allowText, denyText: f.denyText, approval };
    if (!self) { payload.role = f.role; payload.houses = f.houses; payload.status = f.status; }
    if (!editing) { payload.username = f.username; delete payload.status; }
    if (self) { delete payload.allowText; delete payload.denyText; delete payload.approval; delete payload.require2fa; }
    const message = await onSave(payload);
    setBusy(false);
    if (message) setErr(message);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={busy ? undefined : onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="person-title"
        className="relative card p-5 sm:p-6 w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-fade-in grid gap-4">
        <div className="flex items-center justify-between">
          <h2 id="person-title" className="font-bold text-lg text-ink">{editing ? t("ویرایش کاربر") : t("کاربر تازه")}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>

        {!editing && <Field label={t("نام کاربری")} required hint={t("حروف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط؛ حداقل ۳ نویسه")}><Input dir="ltr" value={f.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" required /></Field>}
        <Field label={t("نام نمایشی")} required><Input value={f.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={80} required /></Field>

        {!self && (
          <>
            <Field label={t("نقش")}>
              <Select value={f.role} onChange={(e) => set("role", e.target.value)}>
                {roles.map((r) => <option key={r} value={r}>{t(ROLES[r].label)}</option>)}
              </Select>
            </Field>
            <fieldset className="grid gap-2">
              <legend className="text-[13px] font-medium text-ink-soft mb-1">{t("بخش‌ها")}</legend>
              {HOUSES.map((h) => (
                <label key={h} className={`flex items-center gap-2 text-sm ${grantable.includes(h) ? "text-ink" : "text-ink-faint"}`}>
                  <input type="checkbox" checked={f.houses.includes(h)} disabled={!grantable.includes(h)} onChange={() => toggleHouse(h)} /> {t(HOUSE_LABEL[h])}
                </label>
              ))}
            </fieldset>
            {editing && (
              <Field label={t("وضعیت")}>
                <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
                  {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
                </Select>
              </Field>
            )}
            <Toggle checked={f.require2fa} onChange={(v) => set("require2fa", v)} label={t("ورود دومرحله‌ای الزامی باشد")} desc={t("بدون آن، ورود این کاربر ممکن نیست تا خودش آن را راه‌اندازی کند.")} />
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer text-sm font-medium text-ink-soft">{t("تنظیمات پیشرفتهٔ دسترسی")}</summary>
              <div className="grid gap-3 mt-3">
                <Field label={t("مجوزهای اضافه")} hint={t("هر خط یک مجوز؛ مثلاً health.quotes.edit یا beauty.products.*")}><Textarea dir="ltr" rows={3} value={f.allowText} onChange={(e) => set("allowText", e.target.value)} /></Field>
                <Field label={t("مجوزهای ممنوع")} hint={t("ممنوع بر همه چیز، حتی بر نقش، غلبه می‌کند.")}><Textarea dir="ltr" rows={3} value={f.denyText} onChange={(e) => set("denyText", e.target.value)} /></Field>
                {f.houses.map((h) => (
                  <div key={h} className="grid gap-2">
                    <p className="text-[13px] font-medium text-ink-soft">{t("کارهایی که در بخش «{house}» باید تأیید شوند", { house: t(HOUSE_LABEL[h]) })}</p>
                    <Toggle checked={!f.custom[h]} onChange={(v) => set("custom", { ...f.custom, [h]: !v })} label={t("پیش‌فرض نقش")} />
                    {f.custom[h] && (
                      <div className="grid sm:grid-cols-2 gap-1.5">
                        {opsOf(h).map((op) => (
                          <label key={op} className="flex items-center gap-2 text-xs text-ink-soft">
                            <input type="checkbox" checked={(f.approval[h] || []).includes(op)} onChange={(e) => set("approval", { ...f.approval, [h]: e.target.checked ? [...(f.approval[h] || []), op] : (f.approval[h] || []).filter((x) => x !== op) })} /> {t(OPERATION_LABELS[op] || op)}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
        {self && <p className="text-xs text-ink-muted">{t("نقش، بخش‌ها و دسترسی‌های خودتان را نمی‌توانید تغییر دهید؛ فقط نام نمایشی.")}</p>}

        {err && <div role="alert" className="text-sm text-warn break-words">{err}</div>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-ghost size-md" onClick={onClose} disabled={busy}>{t("انصراف")}</button>
          <button type="submit" className="btn-primary size-md" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" size={16} />} {editing ? t("ذخیره") : t("ساخت کاربر")}</button>
        </div>
      </form>
    </div>
  );
}
