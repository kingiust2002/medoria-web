"use client";
// components/operator/content/ContentPanel.jsx — the site-content screen of BOTH panels: the announcement banner and the FAQ of one house.
// Each item has its texts in four languages (Tajik first), an order, a published switch and an optional start / end time. Buttons appear only
// for what the person may do (useCan); the server decides again on every action. A save carries the version the screen showed: if the item
// changed meanwhile, the save is refused and the person reloads.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { PageHeader, Field, Input, Select, Textarea, Badge, EmptyState, Spinner, Toggle } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import { CONTENT_LANGS, LIMITS, contentStatus, pickText } from "@/lib/siteContent";
import { SCHEDULE_MESSAGES, isoToLocal, localToIso } from "@/lib/operator/schedule";
import { tr } from "@/lib/panel/i18n";

const KINDS = [{ id: "banner", label: tr("اعلان بالای صفحه") }, { id: "faq", label: tr("پرسش‌های متداول") }];
const STATUS = { draft: { label: tr("پیش‌نویس"), tone: "neutral" }, scheduled: { label: tr("زمان‌بندی‌شده"), tone: "info" }, live: { label: tr("منتشرشده"), tone: "ok" }, ended: { label: tr("پایان‌یافته"), tone: "warn" } };
const NEW_FORM = { text: {}, label: {}, link: "", tone: "info", q: {}, a: {}, sort_order: "0", is_published: false, publish_at: "", unpublish_at: "" };

function Modal({ title, onClose, children }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative card p-5 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-auto animate-fade-in min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-lg text-ink min-w-0 break-words">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted shrink-0"><Icon name="close" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Err({ children }) {
  return children ? <div role="alert" data-testid="ct-error" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> <span className="min-w-0 break-words">{children}</span></div> : null;
}

function formOf(kind, row) {
  if (!row) return { ...NEW_FORM };
  const d = row.data || {};
  return {
    text: { ...(d.text || {}) }, label: { ...(d.label || {}) }, link: d.link || "", tone: d.tone || "info", q: { ...(d.q || {}) }, a: { ...(d.a || {}) },
    sort_order: String(row.sort_order ?? 0), is_published: Boolean(row.is_published), publish_at: isoToLocal(row.publish_at), unpublish_at: isoToLocal(row.unpublish_at),
  };
}

function ContentModal({ kind, row, actions, onClose, onDone }) {
  const t = useT();
  const canWrite = useCan(row ? "content.edit" : "content.create");
  const canPublish = useCan("content.publish"), canSchedule = useCan("content.schedule");
  const [f, setF] = useState(() => formOf(kind, row));
  const [lang, setLang] = useState("tg");
  const [err, setErr] = useState("");
  const [stale, setStale] = useState(false);
  const [pending, start] = useTransition();
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const upLang = (k, v) => setF((s) => ({ ...s, [k]: { ...s[k], [lang]: v } }));
  const filled = (l) => (kind === "banner" ? Boolean(f.text[l]?.trim()) : Boolean(f.q[l]?.trim()));

  function submit(e) {
    e.preventDefault();
    setErr(""); setStale(false);
    const publish_at = localToIso(f.publish_at), unpublish_at = localToIso(f.unpublish_at);
    if (publish_at === undefined || unpublish_at === undefined) { setErr(t(SCHEDULE_MESSAGES.bad)); return; }
    const payload = { text: f.text, label: f.label, link: f.link, tone: f.tone, q: f.q, a: f.a, sort_order: f.sort_order, is_published: f.is_published, publish_at, unpublish_at };
    start(async () => {
      const res = row ? await actions.updateContent(row.id, payload, row.version) : await actions.createContent(kind, payload);
      if (res.ok) { onDone(); return; }
      setErr(t(res.error, res.params));
      if (res.stale) setStale(true);
    });
  }

  return (
    <Modal title={row ? t("ویرایش") : kind === "banner" ? t("اعلان جدید") : t("پرسش جدید")} onClose={onClose}>
      <form onSubmit={submit} data-testid="ct-form">
        <Err>{err}</Err>
        {stale && <button type="button" className="btn-ghost size-sm mb-4" onClick={onDone}>{t("بارگذاری دوباره")}</button>}
        <fieldset disabled={!canWrite} className="min-w-0">
          <div role="tablist" className="flex flex-wrap gap-1.5 mb-3">
            {CONTENT_LANGS.map((l) => (
              <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} data-testid={`ct-lang-${l}`}
                className={`btn-ghost size-sm uppercase ${lang === l ? "!border-brand-violet/50 !text-brand-violet !bg-brand-violet/5" : ""}`}>
                {l}{filled(l) && <span aria-hidden="true" className="ms-1 inline-block w-1.5 h-1.5 rounded-full bg-ok" />}
              </button>
            ))}
          </div>
          <div className="grid gap-4">
            {kind === "banner" ? (
              <>
                <Field label={t("متن اعلان")} hint={t("حداکثر {max} نویسه؛ متن ساده.", { max: LIMITS.bannerText })}>
                  <Textarea value={f.text[lang] || ""} onChange={(e) => upLang("text", e.target.value)} rows={2} maxLength={LIMITS.bannerText} aria-label={t("متن اعلان")} dir={lang === "fa" ? "rtl" : "ltr"} data-testid="ct-text" />
                </Field>
                <Field label={t("متن پیوند (اختیاری)")}>
                  <Input value={f.label[lang] || ""} onChange={(e) => upLang("label", e.target.value)} maxLength={LIMITS.linkLabel} aria-label={t("متن پیوند (اختیاری)")} dir={lang === "fa" ? "rtl" : "ltr"} />
                </Field>
                <Field label={t("پیوند (اختیاری)")} hint={t("با «/» (صفحهٔ همین سایت) یا «https://» شروع شود.")}>
                  <Input value={f.link} onChange={(e) => up("link", e.target.value)} dir="ltr" maxLength={LIMITS.link} aria-label={t("پیوند (اختیاری)")} data-testid="ct-link" />
                </Field>
                <Field label={t("نوع")}>
                  <Select value={f.tone} onChange={(e) => up("tone", e.target.value)} aria-label={t("نوع")}>
                    <option value="info">{t("اطلاع‌رسانی")}</option>
                    <option value="promo">{t("تبلیغاتی")}</option>
                  </Select>
                </Field>
              </>
            ) : (
              <>
                <Field label={t("پرسش")}>
                  <Input value={f.q[lang] || ""} onChange={(e) => upLang("q", e.target.value)} maxLength={LIMITS.question} aria-label={t("پرسش")} dir={lang === "fa" ? "rtl" : "ltr"} data-testid="ct-q" />
                </Field>
                <Field label={t("پاسخ")} hint={t("برای هر زبانی که پرسش دارد، پاسخ هم لازم است.")}>
                  <Textarea value={f.a[lang] || ""} onChange={(e) => upLang("a", e.target.value)} rows={4} maxLength={LIMITS.answer} aria-label={t("پاسخ")} dir={lang === "fa" ? "rtl" : "ltr"} data-testid="ct-a" />
                </Field>
              </>
            )}
            <Field label={t("ترتیب")} hint={t("عدد کوچک‌تر بالاتر نمایش داده می‌شود.")}>
              <Input value={f.sort_order} onChange={(e) => up("sort_order", e.target.value)} inputMode="numeric" dir="ltr" aria-label={t("ترتیب")} />
            </Field>
            <Toggle checked={f.is_published} onChange={(v) => up("is_published", v)} disabled={!canPublish} label={t("منتشر شود")} desc={canPublish ? t("خاموش = پیش‌نویس؛ در سایت دیده نمی‌شود.") : t("اجازهٔ انتشار ندارید.")} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label={t("شروع نمایش")} hint={t("خالی = همین حالا")}>
                <Input type="datetime-local" dir="ltr" value={f.publish_at} onChange={(e) => up("publish_at", e.target.value)} disabled={!canSchedule} aria-label={t("شروع نمایش")} data-testid="ct-start" />
              </Field>
              <Field label={t("پایان نمایش")} hint={t("خالی = تا زمان برداشتن")}>
                <Input type="datetime-local" dir="ltr" value={f.unpublish_at} onChange={(e) => up("unpublish_at", e.target.value)} disabled={!canSchedule} aria-label={t("پایان نمایش")} data-testid="ct-end" />
              </Field>
            </div>
          </div>
        </fieldset>
        <div className="flex gap-2 mt-5">
          {canWrite && <button type="submit" disabled={pending} className="btn-primary size-md flex-1 disabled:opacity-60" data-testid="ct-save">{pending ? <Spinner /> : <Icon name="save" size={17} />}{t("ذخیره")}</button>}
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ContentPanel({ data, actions, house }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const router = useRouter();
  const canCreate = useCan("content.create"), canEdit = useCan("content.edit"), canDelete = useCan("content.delete");
  const [kind, setKind] = useState("banner");
  const [modal, setModal] = useState(null);                  // { row } (row null = new)
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const now = data?.now ? Date.parse(data.now) : 0;
  const rows = useMemo(() => (data?.rows || []).filter((r) => r.kind === kind), [data, kind]);

  if (!data?.ok) {
    return (
      <>
        <PageHeader title={t("محتوای سایت")} />
        <div role="alert" className="text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {t(data?.error)}</div>
      </>
    );
  }

  const done = () => { setModal(null); setMsg({ text: t("ذخیره شد."), ok: true }); router.refresh(); };
  function remove(r) {
    start(async () => {
      const res = await actions.deleteContent(r.id, r.version);
      if (res.ok) { setMsg({ text: t("حذف شد."), ok: true }); router.refresh(); } else setMsg({ text: t(res.error, res.params), ok: false });
    });
  }
  const preview = (r) => (r.kind === "banner" ? pickText(r.data?.text, "tg") : pickText(r.data?.q, "tg"));

  return (
    <>
      <PageHeader title={t("محتوای سایت")} subtitle={house === "beauty" ? t("اعلان و پرسش‌های متداول Medoria Beauty") : t("اعلان و پرسش‌های متداول Medoria Health")}>
        {canCreate && <button type="button" className="btn-primary size-md" onClick={() => setModal({ row: null })} data-testid="ct-new"><Icon name="plus" size={17} /> {kind === "banner" ? t("اعلان جدید") : t("پرسش جدید")}</button>}
      </PageHeader>
      {msg && <div role="status" data-testid="ct-msg" className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}><Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> <span className="min-w-0 break-words">{msg.text}</span></div>}

      <div role="tablist" className="flex flex-wrap gap-1.5 mb-4">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="tab" aria-selected={kind === k.id} onClick={() => setKind(k.id)} data-testid={`ct-tab-${k.id}`}
            className={`btn-ghost size-sm ${kind === k.id ? "!border-brand-violet/50 !text-brand-violet !bg-brand-violet/5" : ""}`}>{t(k.label)}</button>
        ))}
      </div>
      {kind === "banner" && <p className="text-xs text-ink-muted mb-3">{t("فقط یک اعلان نمایش داده می‌شود: کمترین «ترتیب»، و در برابری جدیدترین.")}</p>}

      {rows.length === 0 ? (
        <EmptyState icon="list" title={kind === "banner" ? t("هنوز اعلانی ساخته نشده") : t("هنوز پرسشی ثبت نشده")} desc={t("تا چیزی منتشر نشود، سایت دقیقاً مثل قبل است.")} />
      ) : (
        <div className="card divide-y divide-line overflow-hidden" data-testid="ct-list">
          {rows.map((r) => {
            const st = contentStatus(r, now);
            return (
              <div key={r.id} data-testid="ct-row" data-status={st} className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                <Badge tone={STATUS[st].tone}>{t(STATUS[st].label)}</Badge>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="text-sm text-ink break-words line-clamp-2">{preview(r) || "—"}</p>
                  <p className="text-xs text-ink-muted break-words">
                    {[CONTENT_LANGS.filter((l) => (r.kind === "banner" ? r.data?.text?.[l] : r.data?.q?.[l])).join(" · ").toUpperCase(),
                      r.publish_at ? `${t("شروع نمایش")}: ${fmtDate(r.publish_at)}` : "", r.unpublish_at ? `${t("پایان نمایش")}: ${fmtDate(r.unpublish_at)}` : "", r.updated_label].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  <button type="button" className="btn-ghost size-sm" onClick={() => setModal({ row: r })} data-testid="ct-open">{canEdit ? t("ویرایش") : t("مشاهده")}</button>
                  {canDelete && <button type="button" disabled={pending} className="btn-ghost size-sm !text-warn" onClick={() => remove(r)} data-testid="ct-delete">{t("حذف")}</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && <ContentModal kind={kind} row={modal.row} actions={actions} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}
