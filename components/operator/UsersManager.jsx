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
import { OPERATION_LABELS } from "@/lib/operator/userLabels";
import { approvableFor } from "@/lib/operator/authz";
import { ArchiveDialog, ConfirmWithReauth, ReauthFields, StatusHelp, emptyReauth, reauthPayload } from "@/components/operator/UserDialogs";

const HOUSE_LABEL = { health: tr("سلامت"), beauty: tr("زیبایی") };
const STATUS_LABEL = { active: tr("فعال"), disabled: tr("غیرفعال"), blocked: tr("مسدود"), archived: tr("بایگانی‌شده") };
const STATUS_TONE = { active: "ok", disabled: "neutral", blocked: "warn", archived: "neutral" };
const EDITABLE_STATUSES = ["active", "disabled", "blocked"];          // "archived" is reached only by the archive button, and left only by the restore
const FILTERS = [["current", tr("جاری")], ["archived", tr("بایگانی‌شده")], ["all", tr("همه")]];
const isCurrent = (u) => u.status !== "archived";
// "needs approval" is offered only for operations that can really be approved (lib/operator/authz.js APPROVABLE_OPERATIONS)
const opsOf = (house) => approvableFor(house);

function emptyForm(actor) {
  return { username: "", displayName: "", role: "viewer", houses: actor.role === "owner" ? [] : [...actor.houses], require2fa: true, status: "active", allowText: "", denyText: "", custom: {}, approval: {} };
}
function formFrom(user) {
  const custom = {}, approval = {};
  for (const h of HOUSES) if (Array.isArray(user.approval?.[h])) { custom[h] = true; approval[h] = user.approval[h].filter((op) => approvableFor(h).includes(op)); }   // an old entry that can no longer be approved is dropped from the form
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
  const [filter, setFilter] = useState("current");      // current people (default) | archived | all
  const counts = { current: users.filter(isCurrent).length, archived: users.filter((u) => !isCurrent(u)).length, all: users.length };
  const shown = users.filter((u) => filter === "all" || (filter === "archived" ? !isCurrent(u) : isCurrent(u)));
  const warnAudit = (res) => (res?.auditWarning ? " " + t("ولی ثبت نتیجه در تاریخچه ناموفق بود؛ ثبت «تلاش» در تاریخچه هست.") : "");

  const after = (res, okText) => {
    if (res?.ok) { setNotice(okText + warnAudit(res)); router.refresh(); return true; }
    setNotice(t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."));
    if (res?.conflict) router.refresh();
    return false;
  };

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("نمایش کاربران")} data-testid="people-filter">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} data-filter={key} onClick={() => setFilter(key)}
              className={`size-sm rounded-full border px-3 py-1 text-sm ${filter === key ? "border-navy bg-navy text-white" : "border-line text-ink-soft hover:bg-line-soft"}`}>
              {t(label)} <span className="tabular opacity-80">({counts[key]})</span>
            </button>
          ))}
        </div>
        {canManage && <button type="button" className="btn-primary size-md" onClick={() => setDialog({ mode: "create" })}><Icon name="plus" size={18} /> {t("کاربر تازه")}</button>}
      </div>
      <details className="rounded-xl border border-line p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink-soft">{t("تفاوت بایگانی، مسدود و غیرفعال")}</summary>
        <div className="mt-3"><StatusHelp /></div>
      </details>

      {users.length === 0 ? (
        <EmptyState icon="user" title={t("هنوز کاربری نیست")} desc={t("اولین کاربر را بسازید.")} />
      ) : shown.length === 0 ? (
        <EmptyState icon="user" title={filter === "archived" ? t("کاربر بایگانی‌شده‌ای نیست") : t("کاربری پیدا نشد")} desc="" />
      ) : (
        <ul className="grid gap-3" data-testid="people-list">
          {shown.map((u) => (
            <li key={u.id} className={`card p-4 flex flex-wrap items-start justify-between gap-3 ${isCurrent(u) ? "" : "opacity-90"}`} data-testid="person" data-status={u.status}>
              <div className="min-w-0">
                <p className="font-semibold text-ink break-words">{u.displayName}{u.id === actor.id && <span className="text-ink-faint font-normal"> · {t("شما")}</span>}</p>
                <p className="text-xs text-ink-muted break-all" dir="ltr">{u.username}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Badge tone={STATUS_TONE[u.status] || "neutral"}>{t(STATUS_LABEL[u.status] || u.status)}</Badge>
                  <Badge tone="violet">{t(ROLES[u.role]?.label || u.role)}</Badge>
                  {u.houses.map((h) => <Badge key={h} tone="info">{t(HOUSE_LABEL[h] || h)}</Badge>)}
                  <Badge tone={u.hasTotp ? "ok" : u.require2fa ? "warn" : "neutral"}>{u.hasTotp ? t("ورود دومرحله‌ای فعال") : u.require2fa ? t("ورود دومرحله‌ای لازم، هنوز راه‌اندازی نشده") : t("بدون ورود دومرحله‌ای")}</Badge>
                </div>
                {u.status === "archived" && u.archivedAt && <p className="text-[11px] text-ink-muted mt-2" data-testid="archived-at">{t("بایگانی از {date}", { date: formatDate(lang, u.archivedAt, { month: "short", day: "numeric", year: "numeric" }) })}</p>}
                <p className="text-[11px] text-ink-faint mt-2">{u.lastLoginAt ? t("آخرین ورود: {date}", { date: formatDate(lang, u.lastLoginAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) }) : t("هنوز وارد نشده")}</p>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2 min-w-0 max-w-full">
                  {u.status === "archived" ? (
                    <button type="button" className="btn-ghost size-xs" onClick={() => setDialog({ mode: "restore", user: u })} data-testid="restore-open"><Icon name="refresh" size={14} /> {t("بازگردانی از بایگانی")}</button>
                  ) : (
                    <>
                      <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => setDialog({ mode: "edit", user: u })}><Icon name="edit" size={14} /> {t("ویرایش")}</button>
                      {u.id !== actor.id && <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => setDialog({ mode: "reset", user: u })} data-testid="reset-open"><Icon name="lock" size={14} /> {t("رمز موقت")}</button>}
                      {u.id !== actor.id && actor.role === "owner" && <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => setDialog({ mode: "reset2fa", user: u })} data-testid="reset2fa-open"><Icon name="shield" size={14} /> {t("بازیابی ورود دومرحله‌ای")}</button>}
                      <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => endSessions(u)}>{busyId === u.id ? <Spinner size={12} /> : <Icon name="logout" size={14} />} {t("بستن نشست‌ها")}</button>
                      {u.id !== actor.id && <button type="button" className="btn-ghost size-xs" disabled={busyId === u.id} onClick={() => setDialog({ mode: "archive", user: u })} data-testid="archive-open"><Icon name="archive" size={14} /> {t("بایگانی کاربر")}</button>}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {dialog && (dialog.mode === "create" || dialog.mode === "edit" || dialog.mode === "restore") && (
        <PersonDialog
          mode={dialog.mode} user={dialog.user} actor={actor} panel={panel} onClose={() => setDialog(null)}
          onSave={async (payload, reauth) => {
            const res = dialog.mode === "create" ? await actions.createPerson(payload, reauth).catch(() => null)
              : dialog.mode === "restore" ? await actions.restorePerson(dialog.user.id, payload, dialog.user.version, reauth).catch(() => null)
              : await actions.updatePerson(dialog.user.id, payload, dialog.user.version, reauth).catch(() => null);
            if (res?.ok) {
              setDialog(null); router.refresh();
              if (res.tempPassword) { setSecret({ who: res.user.displayName, password: res.tempPassword }); setNotice(warnAudit(res).trim()); }
              else if (dialog.mode === "restore") setNotice(t("«{name}» از بایگانی برگشت. باید در اولین ورود رمز تازه بگذارد؛ نشست‌های قبلی او معتبر نمی‌شود.", { name: res.user.displayName }) + warnAudit(res));
              else setNotice((res.sessionsEnded ? t("ذخیره شد؛ نشست‌های این کاربر بسته شد.") : t("ذخیره شد.")) + warnAudit(res));
              return null;
            }
            if (res?.conflict) router.refresh();
            return { message: t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."), reauth: Boolean(res?.reauth), needCode: Boolean(res?.needCode) };
          }}
        />
      )}
      {dialog?.mode === "archive" && (
        <ArchiveDialog user={dialog.user} people={users} panel={panel} actor={actor} actions={actions} onClose={() => setDialog(null)}
          onDone={(res, moved) => {
            setDialog(null); router.refresh();
            setNotice(t("«{name}» بایگانی شد؛ همهٔ نشست‌های او بسته شد.", { name: dialog.user.displayName })
              + (moved > 0 ? " " + t("{count} درخواست به فرد انتخاب‌شده منتقل شد.", { count: moved }) : moved === -1 ? " " + t("انتقال درخواست‌ها ناموفق بود؛ بعداً دوباره امتحان کنید.") : "") + warnAudit(res));
          }} />
      )}
      {dialog?.mode === "reset" && (
        <ConfirmWithReauth title={t("رمز موقت برای «{name}»", { name: dialog.user.displayName })} confirmLabel={t("ساخت رمز موقت")} actor={actor} onClose={() => setDialog(null)}
          run={async (reauth) => {
            const res = await actions.resetPersonPassword(dialog.user.id, reauth).catch(() => null);
            if (!res?.ok) return { message: t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."), needCode: res?.needCode };
            setDialog(null); router.refresh(); setSecret({ who: dialog.user.displayName, password: res.tempPassword }); setNotice(warnAudit(res).trim());
            return null;
          }}>
          <p className="text-sm text-ink leading-relaxed">{t("رمز عبور «{name}» عوض می‌شود و همهٔ نشست‌های او بسته می‌شود. رمز تازه فقط یک بار نمایش داده می‌شود.", { name: dialog.user.displayName })}</p>
        </ConfirmWithReauth>
      )}
      {dialog?.mode === "reset2fa" && (
        <ConfirmWithReauth title={t("بازیابی ورود دومرحله‌ای «{name}»", { name: dialog.user.displayName })} confirmLabel={t("پاک کردن ورود دومرحله‌ای و ساخت رمز موقت")} tone="danger" actor={actor} onClose={() => setDialog(null)}
          run={async (reauth) => {
            const res = await actions.resetPersonTwoFactor(dialog.user.id, reauth).catch(() => null);
            if (!res?.ok) return { message: t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."), needCode: res?.needCode };
            setDialog(null); router.refresh(); setSecret({ who: dialog.user.displayName, password: res.tempPassword, kind: "twofa" }); setNotice(warnAudit(res).trim());
            return null;
          }}>
          <p className="text-sm text-ink leading-relaxed">{t("فقط وقتی که «{name}» هم گوشی و هم کدهای بازیابی را از دست داده است و از هویت او مطمئن هستید. ورود دومرحله‌ای و کدهای بازیابی او پاک می‌شود، رمز عبورش با یک رمز موقت جایگزین می‌شود، همهٔ نشست‌هایش بسته می‌شود و او باید پیش از هر کاری ورود دومرحله‌ای تازه راه‌اندازی کند. این کار هیچ راه میان‌بری برای دورزدن ورود دومرحله‌ای نیست.", { name: dialog.user.displayName })}</p>
        </ConfirmWithReauth>
      )}
    </div>
  );
}

function TempPassword({ secret, onClose }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <SectionCard title={t("رمز موقت برای «{name}»", { name: secret.who })} icon="lock" desc={secret.kind === "twofa" ? t("این رمز فقط یک بار نمایش داده می‌شود. آن را امن و حضوری یا با کانالی که مطمئن هستید به او بدهید. با آن وارد می‌شود، رمز تازه می‌گذارد و ورود دومرحله‌ای تازه راه‌اندازی می‌کند؛ تا آن موقع هیچ بخش دیگری باز نمی‌شود.") : t("این رمز فقط یک بار نمایش داده می‌شود. آن را امن به او بدهید؛ در اولین ورود باید رمز خود را عوض کند.")}>
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
  const restoring = mode === "restore";
  const editing = mode === "edit" || restoring;
  const self = mode === "edit" && user.id === actor.id;
  const [f, setF] = useState(() => (editing ? formFrom(user) : emptyForm(actor)));
  // creating and restoring always ask the manager to prove who they are again; an edit asks only if the server says that change is sensitive
  const [askReauth, setAskReauth] = useState(mode === "create" || restoring);
  const [needCode, setNeedCode] = useState(Boolean(actor.hasTotp));
  const [reauth, setReauth] = useState(emptyReauth);
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
    if (restoring) { delete payload.status; delete payload.displayName; }
    if (self) { delete payload.allowText; delete payload.denyText; delete payload.approval; delete payload.require2fa; }
    const out = await onSave(payload, reauthPayload(reauth));
    setBusy(false);
    if (out) {
      setErr(out.message);
      if (out.reauth) { setAskReauth(true); if (out.needCode) setNeedCode(true); setReauth((r) => ({ ...r, code: "" })); }
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={busy ? undefined : onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="person-title"
        className="relative card p-5 sm:p-6 w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-fade-in grid gap-4">
        <div className="flex items-center justify-between">
          <h2 id="person-title" className="font-bold text-lg text-ink">{restoring ? t("بازگردانی «{name}» از بایگانی", { name: user.displayName }) : editing ? t("ویرایش کاربر") : t("کاربر تازه")}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>

        {restoring && <p className="text-sm text-ink-soft leading-relaxed" data-testid="restore-note">{t("نقش، بخش‌ها، مجوزها و الزام ورود دومرحله‌ای را همین حالا بازبینی کنید. نشست‌های قبلی او معتبر نمی‌شود و در اولین ورود باید رمز تازه بگذارد.")}</p>}
        {!editing && <Field label={t("نام کاربری")} required hint={t("حروف انگلیسی کوچک، عدد، نقطه، خط تیره یا زیرخط؛ حداقل ۳ نویسه")}><Input dir="ltr" value={f.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" required /></Field>}
        {!restoring && <Field label={t("نام نمایشی")} required><Input value={f.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={80} required /></Field>}

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
            {mode === "edit" && (
              <Field label={t("وضعیت")}>
                <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
                  {EDITABLE_STATUSES.map((s) => <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>)}
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

        {askReauth && <ReauthFields value={reauth} onChange={setReauth} needCode={needCode} />}
        {err && <div role="alert" className="text-sm text-warn break-words" data-testid="dialog-error">{err}</div>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-ghost size-md" onClick={onClose} disabled={busy}>{t("انصراف")}</button>
          <button type="submit" className="btn-primary size-md" disabled={busy}>{busy ? <Spinner /> : <Icon name="check" size={16} />} {restoring ? t("بازگردانی از بایگانی") : editing ? t("ذخیره") : t("ساخت کاربر")}</button>
        </div>
      </form>
    </div>
  );
}
