"use client";
// The dialogs of the people screen that are not the big "person" form: the manager's re-authentication fields, a confirmation that asks for
// them, and the archive dialog (what archive means, what the person still holds, where to move it). The convenience only — the server asks
// for the manager's password (and second-factor code) again, whatever this screen did (lib/operator/userActionsCore.js confirmManager).
import { useEffect, useId, useState } from "react";
import Icon from "@/components/shared/Icon";
import { Field, Input, Select, Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";

export function DialogShell({ title, titleId, onClose, busy, children }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={busy ? undefined : onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative card p-4 sm:p-6 w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-fade-in grid gap-4 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-bold text-lg text-ink min-w-0 break-words">{title}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 shrink-0 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// The manager's own password, plus a code from their phone when they have a second factor.
export function ReauthFields({ value, onChange, needCode }) {
  const t = useT();
  return (
    <div className="grid gap-3 rounded-xl border border-line p-3" data-testid="reauth">
      <p className="text-xs text-ink-muted leading-relaxed">{t("برای امنیت، هویت خودتان را دوباره تأیید کنید: رمز عبور خودتان (نه رمز این کاربر).")}</p>
      <Field label={t("رمز عبور شما")} required>
        <Input type="password" dir="ltr" autoComplete="current-password" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} data-testid="reauth-password" />
      </Field>
      {needCode && (
        <Field label={t("کد دومرحله‌ای شما")} hint={t("اگر همین کد را همین حالا برای ورود یا کار دیگری به کار برده‌اید، کد بعدی را صبر کنید.")}>
          <Input dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={value.code} onChange={(e) => onChange({ ...value, code: e.target.value })} data-testid="reauth-code" />
        </Field>
      )}
    </div>
  );
}

export const emptyReauth = () => ({ password: "", code: "" });
export const reauthPayload = (r) => (r && r.password ? { password: r.password, code: r.code || undefined } : undefined);

// A confirmation that needs the manager's password. `run(reauth)` → null (done) | { message, needCode? }.
export function ConfirmWithReauth({ title, confirmLabel, tone = "primary", actor, onClose, run, children, disabled = false }) {
  const t = useT();
  const titleId = useId();
  const [reauth, setReauth] = useState(emptyReauth);
  const [needCode, setNeedCode] = useState(Boolean(actor.hasTotp));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setErr(""); setBusy(true);
    const out = await run(reauthPayload(reauth));
    setBusy(false);
    if (out) { setErr(out.message); if (out.needCode) setNeedCode(true); setReauth((r) => ({ ...r, code: "" })); }
  }
  return (
    <DialogShell title={title} titleId={titleId} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="grid gap-4">
        {children}
        <ReauthFields value={reauth} onChange={setReauth} needCode={needCode} />
        {err && <div role="alert" className="text-sm text-warn break-words" data-testid="dialog-error">{err}</div>}
        <div className="flex flex-wrap gap-2 justify-end">
          <button type="button" className="btn-ghost size-md" onClick={onClose} disabled={busy}>{t("انصراف")}</button>
          <button type="submit" className={tone === "danger" ? "btn-primary size-md bg-warn" : "btn-primary size-md"} disabled={busy || disabled || !reauth.password} data-testid="dialog-confirm">
            {busy ? <Spinner /> : <Icon name="check" size={16} />} {confirmLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

// What each way of taking somebody out of the team means. Shown in the archive dialog and as help above the list.
export function StatusHelp({ compact = false }) {
  const t = useT();
  const rows = [
    [t("بایگانی"), t("فرد دیگر در تیم نیست. ورود و همهٔ کارها بسته می‌شود و نشست‌های او پایان می‌یابد، اما حساب و نامش در تاریخچه می‌ماند و نام کاربری‌اش به کس دیگری داده نمی‌شود. با «بازگردانی از بایگانی» برمی‌گردد.")],
    [t("مسدود"), t("برای وقتی که به سوءاستفاده شک دارید: ورود بسته است و حساب با هشدار در فهرست می‌ماند. با تغییر وضعیت باز می‌شود.")],
    [t("غیرفعال"), t("خاموشی موقت (مرخصی، مأموریت): ورود بسته است و هر زمان با تغییر وضعیت دوباره فعال می‌شود.")],
  ];
  return (
    <dl className={`grid gap-2 ${compact ? "text-xs" : "text-sm"} text-ink-soft`} data-testid="status-help">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="font-semibold text-ink inline">{k}: </dt>
          <dd className="inline leading-relaxed">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ArchiveDialog({ user, people, panel, actor, actions, onClose, onDone }) {
  const t = useT();
  const [open, setOpen] = useState(undefined);        // undefined = loading, null = not countable, number
  const [to, setTo] = useState("");
  useEffect(() => {
    let live = true;
    actions.personResponsibilities(user.id).then((r) => { if (live) setOpen(r?.ok ? r.quotes : null); }).catch(() => { if (live) setOpen(null); });
    return () => { live = false; };
  }, [actions, user.id]);
  const candidates = people.filter((p) => p.id !== user.id && p.status === "active" && p.houses.includes(panel));
  return (
    <ConfirmWithReauth
      title={t("بایگانی «{name}»", { name: user.displayName })}
      confirmLabel={t("بایگانی کاربر")} tone="danger" actor={actor} onClose={onClose}
      run={async (reauth) => {
        const res = await actions.archivePerson(user.id, user.version, reauth).catch(() => null);
        if (!res?.ok) return { message: t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید."), needCode: res?.needCode };
        let moved = null;
        if (to && open > 0) {
          const m = await actions.transferPersonResponsibilities(user.id, to).catch(() => null);
          moved = m?.ok ? m.count : -1;
        }
        onDone(res, moved);
        return null;
      }}
    >
      <p className="text-sm text-ink leading-relaxed">{t("«{name}» بلافاصله نمی‌تواند وارد شود و کاری انجام دهد، و همهٔ نشست‌های او بسته می‌شود. حساب، شناسه و نامش در تاریخچه، انبار، تأییدها و درخواست‌ها می‌ماند.", { name: user.displayName })}</p>
      <StatusHelp compact />
      <div className="rounded-xl border border-line p-3 grid gap-2" data-testid="responsibilities">
        <p className="text-sm font-medium text-ink-soft">{t("مسئولیت‌های فعلی او در این بخش")}</p>
        {open === undefined && <p className="text-xs text-ink-muted flex items-center gap-2"><Spinner size={12} /> {t("در حال بررسی…")}</p>}
        {open === null && <p className="text-xs text-ink-muted">{t("شمارش ممکن نشد؛ درخواست‌های او همان‌طور که هست می‌ماند و بعداً می‌توانید آنها را منتقل کنید.")}</p>}
        {typeof open === "number" && open === 0 && <p className="text-xs text-ink-muted" data-testid="responsibilities-none">{t("درخواست در جریانی به نام او نیست.")}</p>}
        {typeof open === "number" && open > 0 && (
          <>
            <p className="text-xs text-ink-soft" data-testid="responsibilities-count">{t("{count} درخواست در جریان به نام او است. تا وقتی منتقل نکنید، به نام او می‌ماند (با نشان «بایگانی‌شده»).", { count: open })}</p>
            <Field label={t("انتقال به")}>
              <Select value={to} onChange={(e) => setTo(e.target.value)} data-testid="transfer-to">
                <option value="">{t("منتقل نکن (همان‌طور بماند)")}</option>
                {candidates.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
              </Select>
            </Field>
          </>
        )}
      </div>
    </ConfirmWithReauth>
  );
}
