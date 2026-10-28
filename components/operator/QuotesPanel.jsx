"use client";
// The Quotes screen of BOTH operator panels (Health and Beauty). Each panel's
// QuotesManager.jsx passes its own server actions, so the screen itself never
// knows which table it touches. Tabs (active / archive / spam / all), tick
// selection and bulk actions (archive, spam, restore, delete) live here once.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { QUOTE_STATUSES, QUOTE_ACTIVE_STATUSES, QUOTE_STATUS_FA, QUOTE_STATUS_TONE, CONTACT_FA, LANG_FA } from "@/lib/operator/constants";
import { PageHeader, Input, Select, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import { isOverdue, notifyFailed, waitingHours, followUpState, customerHistory, retryState } from "@/lib/operator/quoteOps";
import { reconcileQuotes, pruneSelection } from "@/lib/operator/quotesSync";
import DeleteQuoteModal from "@/components/operator/DeleteQuoteModal";
import BulkDeleteQuotesModal from "@/components/operator/BulkDeleteQuotesModal";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import { tr } from "@/lib/panel/i18n";
import ListPager from "@/components/operator/ListPager";
import { useListNav, useDebouncedQuery } from "@/components/operator/useListNav";
import { quoteHref } from "@/lib/operator/listQuery";
import { ScopeNotice, ConfirmFiltered } from "@/components/operator/BulkScope";
import SavedViews from "@/components/operator/SavedViews";

const digits = (s) => String(s || "").replace(/[^\d]/g, "");
const isDue = (x, now) => { const f = followUpState(x, now); return f === "overdue" || f === "today"; };

const EMPTY_ROWS = [];
const TABS = [
  { id: "active", label: tr("فعال") },
  { id: "archived", label: tr("آرشیو") },
  { id: "spam", label: tr("اسپم") },
  { id: "all", label: tr("همه") },
];
// A row that changed on this screen leaves the tab / status it no longer belongs to at once; the server list catches up with the refresh.
const inTab = (x, tab) => (tab === "all" ? true : tab === "active" ? x.status !== "archived" && x.status !== "spam" : x.status === tab);
const MOVED = { archived: tr("درخواست به آرشیو منتقل شد."), spam: tr("درخواست به اسپم منتقل شد."), new: tr("درخواست بازگردانی شد.") };
const BULK_WORDS = { archived: tr("انتقال به آرشیو"), spam: tr("انتقال به اسپم"), new: tr("بازگردانی به «جدید»") };
const BULK_MOVED = { archived: tr("{count} درخواست به آرشیو منتقل شد."), spam: tr("{count} درخواست به اسپم منتقل شد."), new: tr("{count} درخواست بازگردانی شد.") };

// `data` is one server-rendered page (lib/operator/data.js getQuotesPage): { params, ok, rows, total, page, pageCount, size, tabCounts, statusCounts,
// attentionCount, related, customerFile } or { params, ok: false, error }. Tab, text, filters and page live in the address; counts are exact.
export default function QuotesPanel({ data, actions, now: nowProp, reportHref = null, people = [], views = null, viewActions = null, basePath = "/operator/quotes" }) {
  const t = useT();
  const { date: fmtDate, lang, num } = usePanelLang();
  const router = useRouter();
  const { params } = data;
  const initial = data.ok ? data.rows : EMPTY_ROWS;
  const [quotes, setQuotes] = useState(initial);
  const nav = useListNav(basePath, quoteHref, params);
  const search = useDebouncedQuery(params.q, (q) => nav.go({ q }));
  const { tab, status, who, attention } = params;
  // The server page passes its clock, so SSR and hydration agree; every refresh brings a newer one, so "waiting for 24 h"
  // keeps counting while the screen stays open.
  const [now, setNow] = useState(() => nowProp ?? Date.now());
  useEffect(() => { if (nowProp) setNow(nowProp); }, [nowProp]);
  const [openId, setOpenId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [deleting, setDeleting] = useState(null);       // one quote
  // what this person may offer on screen (the server asks again on every action)
  const canStatus = useCan("quotes.status"), canAssign = useCan("quotes.assign"), canDelete = useCan("quotes.delete");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [scopeAll, setScopeAll] = useState(false);          // "all filtered results" (status changes only — deletion stays on the ticked rows)
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const allRef = useRef(null);
  const inflight = useRef(new Set());   // ids whose own edit has not reached the server yet: a refresh must not undo them

  // Fresh rows from the server (router.refresh(), a request added/changed/removed in another session) reach the
  // screen; an edit still in flight keeps its local version.
  useEffect(() => {
    setQuotes((cur) => reconcileQuotes(cur, initial, inflight.current));
    setSelected((sel) => pruneSelection(sel, initial));
  }, [initial]);

  // Coming back to this tab asks the server again, so a request that arrived meanwhile shows up without a reload.
  useEffect(() => {
    let last = 0;
    const again = () => {
      if (document.visibilityState === "hidden" || Date.now() - last < 15000) return;
      last = Date.now();
      router.refresh();
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => { window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, [router]);

  const counts = data.ok ? data.statusCounts : {};                 // exact, per status of this tab
  const tabCounts = data.ok ? data.tabCounts : { active: 0, archived: 0, spam: 0, all: 0 };
  const statusOptions = tab === "active" ? QUOTE_ACTIVE_STATUSES : tab === "all" ? QUOTE_STATUSES : [];

  // the server already filtered; only the rows edited on this screen are re-checked, so a moved request leaves the list at once
  const rows = useMemo(() => quotes.filter((x) => inTab(x, tab) && (!status || x.status === status)), [quotes, tab, status]);

  const assignees = useMemo(() => [...new Set([...people, who && who !== "__none" ? who : null, ...quotes.map((x) => x.assigned_to)].filter(Boolean))].sort((a, b) => a.localeCompare(b, lang)), [quotes, people, who, lang]);
  const needAttention = data.ok ? data.attentionCount : 0;

  // Only rows that are on screen can be selected: a filter change can never leave
  // a hidden row inside a bulk action.
  const selectedRows = useMemo(() => rows.filter((x) => selected.has(x.id)), [rows, selected]);
  const allChecked = rows.length > 0 && selectedRows.length === rows.length;
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = selectedRows.length > 0 && !allChecked; }, [selectedRows.length, allChecked]);

  function flash(text, ok = false) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4500); }
  function patch(id, fields) { setQuotes((qs) => qs.map((x) => (x.id === id ? { ...x, ...fields } : x))); }
  const listKey = data.ok ? `${data.page}|${JSON.stringify(params)}` : "";
  useEffect(() => { setScopeAll(false); setConfirm(null); }, [listKey]);
  function goTab(id) { setSelected(new Set()); setOpenId(null); nav.go({ tab: id, status: "", who: "", attention: false }, { replace: false }); }
  function toggle(id) { setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setSelected(allChecked ? new Set() : new Set(rows.map((x) => x.id))); }

  function changeStatus(id, val, okText) {
    const prev = quotes.find((x) => x.id === id)?.status;
    patch(id, { status: val });
    inflight.current.add(id);
    startTransition(async () => {
      let res;
      try { res = await actions.updateQuoteStatus(id, val); } finally { inflight.current.delete(id); }
      if (!res.ok) { patch(id, { status: prev }); flash(t(res.error)); }
      else { if (okText) flash(okText, true); router.refresh(); }     // the exact counts come from the server
    });
  }
  function saveAssignee(id, name) {
    setSavingId(id);
    startTransition(async () => {
      const res = await actions.assignQuote(id, name);
      setSavingId(null);
      if (res.ok) { patch(id, { assigned_to: res.assignee }); flash(res.assignee ? t("مسئول ذخیره شد.") : t("مسئول برداشته شد."), true); }
      else { flash(t(res.error)); if (res.notFound) router.refresh(); }
    });
  }
  function saveFollowUp(id, date) {
    setSavingId(id);
    startTransition(async () => {
      const res = await actions.setQuoteFollowUp(id, date);
      setSavingId(null);
      if (res.ok) { patch(id, { follow_up_at: res.followUpAt }); flash(res.followUpAt ? t("تاریخ پیگیری ذخیره شد.") : t("تاریخ پیگیری برداشته شد."), true); }
      else { flash(t(res.error)); if (res.notFound) router.refresh(); }
    });
  }
  function retryNotice(id) {
    setSavingId(id);
    startTransition(async () => {
      const res = await actions.retryQuoteNotice(id);
      setSavingId(null);
      if (res.ok) { patch(id, { notify_status: "sent", notify_detail: null }); flash(t(res.message), true); }
      else { flash(t(res.error)); router.refresh(); }
    });
  }
  function saveNotes(id, notes) {
    setSavingId(id);
    startTransition(async () => {
      const res = await actions.updateQuoteNotes(id, notes);
      setSavingId(null);
      if (res.ok) { patch(id, { internal_notes: notes }); flash(t("یادداشت ذخیره شد."), true); } else flash(t(res.error));
    });
  }

  function bulkStatus(val) {
    if (scopeAll) { setConfirm({ val, what: t(BULK_WORDS[val]) }); return; }
    const ids = selectedRows.map((x) => x.id);
    ids.forEach((id) => inflight.current.add(id));
    startTransition(async () => {
      let res;
      try { res = await actions.updateQuotesStatus(ids, val); } finally { ids.forEach((id) => inflight.current.delete(id)); }
      if (!res.ok) { flash(t(res.error)); if (res.notFound) router.refresh(); return; }
      const done = new Set(res.updatedIds || ids);
      setQuotes((qs) => qs.map((x) => (done.has(x.id) ? { ...x, status: val } : x)));
      setSelected(new Set());
      flash(t(BULK_MOVED[val] || "{count} درخواست تغییر کرد.", { count: res.count }) + (res.missing ? " " + t("({missing} مورد دیگر پیدا نشد.)", { missing: res.missing }) : ""), true);
      router.refresh();
    });
  }

  async function runFiltered() {
    const { val } = confirm;
    setConfirmBusy(true);
    const res = await actions.updateFilteredQuotesStatus(Object.fromEntries(Object.entries(params).filter(([k]) => !["page", "size"].includes(k))), val, data.total).catch(() => null);
    setConfirmBusy(false); setConfirm(null);
    if (!res) { flash(t("ارتباط با سرور برقرار نشد.")); return; }
    setScopeAll(false); setSelected(new Set());
    if (res.ok) flash(t(BULK_MOVED[val] || "{count} درخواست تغییر کرد.", { count: res.count }), true); else flash(t(res.error));
    router.refresh();
  }

  function afterDelete(gone, res) {
    if (res?.pending) {                       // sent for approval: nothing is deleted yet, the request stays in the list
      setDeleting(null); setBulkDeleting(false); setSelected(new Set());
      flash(t(res.message), true);
      return;
    }
    const ids = new Set(gone);
    setQuotes((qs) => qs.filter((x) => !ids.has(x.id)));
    setOpenId((cur) => (ids.has(cur) ? null : cur));
    setSelected((s) => { const n = new Set(s); for (const id of ids) n.delete(id); return n; });
    setDeleting(null); setBulkDeleting(false);
    if (res?.ok) flash(res.count > 1 ? t("{count} درخواست حذف شد.", { count: res.count }) + (res.missing ? " " + t("({missing} مورد دیگر پیدا نشد.)", { missing: res.missing }) : "") : t("درخواست حذف شد."), true);
    else flash(t(res?.error));
    router.refresh();
  }

  const nActive = tabCounts.active, nArch = tabCounts.archived, nSpam = tabCounts.spam;

  return (
    <>
      <PageHeader title={t("استعلام‌ها")} subtitle={t("{nActive} فعال · {nArch} آرشیو · {nSpam} اسپم", { nActive: num(nActive), nArch: num(nArch), nSpam: num(nSpam) })}>
        {reportHref && <Link href={reportHref} className="btn-ghost size-md" data-testid="quotes-report-link"><Icon name="clock" size={17} /> {t("گزارش")}</Link>}
      </PageHeader>

      <div role="tablist" aria-label={t("دسته‌بندی استعلام‌ها")} className="flex flex-wrap gap-2 mb-3">
        {TABS.map((tb) => {
          const on = tab === tb.id;
          return (
            <button key={tb.id} type="button" role="tab" aria-selected={on} onClick={() => goTab(tb.id)}
              className={`btn-ghost size-sm ${on ? "!border-brand-violet/60 !text-brand-violet !bg-brand-violet/5" : ""}`}>
              {t(tb.label)} <span className="text-ink-faint tabular">{tabCounts[tb.id]}</span>
            </button>
          );
        })}
      </div>

      <form method="get" action={basePath} onSubmit={(e) => { e.preventDefault(); search.commitNow(); }} className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={16} /></span>
          <Input name="q" value={search.text} onChange={(e) => search.change(e.target.value)} placeholder={t("جستجو: نام، تلفن، محصول، کد پیگیری…")} className="ps-9" aria-label={t("جستجو")} />
        </div>
        {statusOptions.length > 0 && (
          <Select name="status" value={status} onChange={(e) => nav.go({ status: e.target.value })} className="w-auto min-w-[150px]" aria-label={t("وضعیت")}>
            <option value="">{t("همه وضعیت‌ها")}</option>
            {statusOptions.map((s) => <option key={s} value={s}>{t(QUOTE_STATUS_FA[s])} ({num(counts[s] || 0)})</option>)}
          </Select>
        )}
        {(assignees.length > 0 || who) && (          // an active filter always keeps its control, so it can be switched off again
          <Select name="who" value={who} onChange={(e) => nav.go({ who: e.target.value })} aria-label={t("فیلتر مسئول")} className="w-auto min-w-[140px]">
            <option value="">{t("همه مسئول‌ها")}</option>
            <option value="__none">{t("بدون مسئول")}</option>
            {assignees.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        )}
        <button type="button" aria-pressed={attention} onClick={() => nav.go({ attention: !attention })}
          className={`btn-ghost size-sm ${attention ? "!border-warn/60 !text-warn !bg-warn/5" : ""}`}>
          <Icon name="alertTriangle" size={15} /> {t("نیازمند پیگیری")} <span className="tabular">{num(needAttention)}</span>
        </button>
        {rows.length > 0 && (canStatus || canDelete) && (
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft cursor-pointer select-none">
            <input ref={allRef} type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-brand-violet" />{t("انتخاب همه ({length})", { length: num(rows.length) })}</label>
        )}
        <noscript><button type="submit" className="btn-ghost size-sm">{t("اعمال")}</button></noscript>
      </form>
      {viewActions && <SavedViews list="quotes" basePath={basePath} params={params} views={views} actions={viewActions} />}

      {!data.ok && (
        <div role="alert" data-testid="list-error" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn">
          <Icon name="alertTriangle" size={16} className="shrink-0" /> <span className="min-w-0 break-words">{t("فهرست خوانده نشد. دوباره تلاش کنید.")}</span>
        </div>
      )}

      {selectedRows.length > 0 && (
        <div role="region" aria-label={t("عملیات گروهی")} className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2 border border-brand-violet/30">
          <span className="text-sm font-medium text-ink">{t("{length} مورد انتخاب شده", { length: scopeAll ? data.total : selectedRows.length })}</span>
          <div className="flex flex-wrap items-center gap-2 ms-auto">
            {canStatus && tab !== "archived" && <button type="button" disabled={pending} onClick={() => bulkStatus("archived")} className="btn-ghost size-sm disabled:opacity-60"><Icon name="archive" size={15} /> {t("آرشیو")}</button>}
            {canStatus && tab !== "spam" && <button type="button" disabled={pending} onClick={() => bulkStatus("spam")} className="btn-ghost size-sm disabled:opacity-60"><Icon name="alertTriangle" size={15} /> {t("اسپم")}</button>}
            {canStatus && (tab === "archived" || tab === "spam" || tab === "all") && <button type="button" disabled={pending} onClick={() => bulkStatus("new")} className="btn-ghost size-sm disabled:opacity-60"><Icon name="refresh" size={15} /> {t("بازگردانی به «جدید»")}</button>}
            {canDelete && !scopeAll && <button type="button" disabled={pending} onClick={() => setBulkDeleting(true)} className="btn-ghost size-sm !text-warn hover:!border-warn/40 disabled:opacity-60"><Icon name="trash" size={15} /> {t("حذف")}</button>}
            <button type="button" onClick={() => { setSelected(new Set()); setScopeAll(false); }} className="btn-ghost size-sm">{t("لغو انتخاب")}</button>
          </div>
          {canStatus && allChecked && <ScopeNotice pageCount={rows.length} total={data.total} all={scopeAll} onAll={() => setScopeAll(true)} onPage={() => setScopeAll(false)} num={num} />}
        </div>
      )}

      {msg && (
        <div role="status" className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> {msg.text}
        </div>
      )}

      {!data.ok ? null : rows.length === 0 ? (
        <EmptyState icon="quote" title={t("استعلامی یافت نشد")} desc={tab === "archived" ? t("آرشیو خالی است.") : tab === "spam" ? t("اسپمی ثبت نشده است.") : t("هنوز درخواستی ثبت نشده یا با فیلتر مطابقت ندارد.")} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((x) => {
            const open = openId === x.id;
            const wa = digits(x.phone);
            const isSel = selected.has(x.id);
            const parked = x.status === "archived" || x.status === "spam";
            return (
              <div key={x.id} className={`card overflow-hidden ${isSel ? "ring-2 ring-brand-violet/40" : ""}`}>
                <div className="flex items-stretch">
                {(canStatus || canDelete) && (
                  <label className="grid place-items-center w-11 shrink-0 cursor-pointer border-e border-line hover:bg-line-soft/40 transition-colors" title={t("انتخاب")}>
                    <input type="checkbox" checked={isSel} onChange={() => toggle(x.id)} aria-label={x.name ? t("انتخاب {name}", { name: x.name }) : t("انتخاب درخواست")} className="w-4 h-4 accent-brand-violet" />
                  </label>
                )}
                <button onClick={() => setOpenId(open ? null : x.id)} className="min-w-0 flex-1 px-4 py-3.5 flex items-center gap-3 text-start hover:bg-line-soft/40 transition-colors">
                  <span className="hidden sm:grid place-items-center w-10 h-10 rounded-xl bg-brand-violet/10 text-brand-violet shrink-0"><Icon name="user" size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">{x.name || t("بدون نام")}{x.organization ? <span className="text-ink-faint font-normal"> · {x.organization}</span> : null}</p>
                    <p className="text-xs text-ink-muted truncate mt-0.5">{x.product_name || t("درخواست عمومی")} · {fmtDate(x.created_at)}</p>
                    {(isOverdue(x, { now }) || notifyFailed(x) || x.assigned_to || followUpState(x, now)) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5 min-w-0">
                        {isOverdue(x, { now }) && <Badge tone="warn">{(() => { const h = waitingHours(x, now); return h >= 48 ? t("بدون پاسخ {days} روز", { days: Math.floor(h / 24) }) : t("بدون پاسخ {hours} ساعت", { hours: Math.floor(h) }); })()}</Badge>}
                        {notifyFailed(x) && <Badge tone="warn">{t("اعلان تلگرام نرسید")}</Badge>}
                        {followUpState(x, now) === "overdue" && <Badge tone="warn" data-testid="badge-followup-overdue">{t("پیگیری عقب‌افتاده")}</Badge>}
                        {followUpState(x, now) === "today" && <Badge tone="violet" data-testid="badge-followup-today">{t("پیگیری امروز")}</Badge>}
                        {x.assigned_to && <Badge tone="neutral" className="max-w-full truncate">{t("مسئول: {assigned_to}", { assigned_to: x.assigned_to })}</Badge>}
                      </div>
                    )}
                  </div>
                  <Badge tone={QUOTE_STATUS_TONE[x.status] || "neutral"}>{QUOTE_STATUS_FA[x.status] ? t(QUOTE_STATUS_FA[x.status]) : x.status}</Badge>
                  <Icon name="chevronDown" size={16} className={`text-ink-faint transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
                </button>
                {canDelete && <button type="button" onClick={() => setDeleting(x)} title={t("حذف درخواست")} aria-label={t("حذف درخواست {v}", { v: x.name || "" }).trim()} className="grid place-items-center w-12 shrink-0 border-s border-line text-ink-muted hover:bg-warn/10 hover:text-warn transition-colors"><Icon name="trash" size={17} /></button>}
                </div>

                {open && (
                  <div className="px-4 pb-4 border-t border-line">
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm py-3.5">
                      <Detail label={t("کد پیگیری")} value={x.tracking_code} ltr />
                      <Detail label={t("مسئول")} value={x.assigned_to} />
                      <Detail label={t("پیگیری")} value={x.follow_up_at ? String(x.follow_up_at).slice(0, 10) : ""} ltr />
                      <Detail label={t("تلفن")} value={x.phone} ltr />
                      <Detail label={t("کانال ترجیحی")} value={CONTACT_FA[x.preferred_contact] ? t(CONTACT_FA[x.preferred_contact]) : x.preferred_contact} />
                      <Detail label={t("کد محصول")} value={x.product_sku} ltr />
                      <Detail label={t("تعداد")} value={x.quantity} />
                      <Detail label={t("زبان")} value={LANG_FA[x.language] ? t(LANG_FA[x.language]) : x.language} />
                      <Detail label={t("صفحه مبدأ")} value={x.source_url} ltr />
                    </div>
                    {Array.isArray(x.items) && x.items.length > 0 && (
                      <div className="rounded-xl border border-line mb-3 overflow-hidden">
                        <p className="px-3 py-2 text-[12px] font-medium text-ink-soft bg-canvas-soft border-b border-line">{t("محصولات درخواستی ({length})", { length: x.items.length })}</p>
                        <ul className="divide-y divide-line">
                          {x.items.map((it, i) => (
                            <li key={`${it.product_id}-${i}`} className="px-3 py-2 text-sm flex items-start gap-3 min-w-0">
                              <span className="min-w-0 flex-1 text-ink-soft">{it.name}{it.sku ? <span className="text-ink-faint" dir="ltr"> · {it.sku}</span> : null}</span>
                              <span className="shrink-0 tabular text-ink" dir="ltr">× {it.quantity}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {x.message && <div className="rounded-xl bg-canvas-soft border border-line p-3 text-sm text-ink-soft leading-relaxed mb-3 whitespace-pre-wrap">{x.message}</div>}

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {canStatus && <Select value={x.status} onChange={(e) => changeStatus(x.id, e.target.value)} className="w-auto !h-9 text-xs">
                        {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{t(QUOTE_STATUS_FA[s])}</option>)}
                      </Select>}
                      {canStatus && x.status !== "archived" && <button type="button" disabled={pending} onClick={() => changeStatus(x.id, "archived", t(MOVED.archived))} className="btn-ghost size-sm disabled:opacity-60"><Icon name="archive" size={15} /> {t("آرشیو")}</button>}
                      {canStatus && x.status !== "spam" && <button type="button" disabled={pending} onClick={() => changeStatus(x.id, "spam", t(MOVED.spam))} className="btn-ghost size-sm disabled:opacity-60"><Icon name="alertTriangle" size={15} /> {t("اسپم")}</button>}
                      {canStatus && parked && <button type="button" disabled={pending} onClick={() => changeStatus(x.id, "new", t(MOVED.new))} className="btn-ghost size-sm disabled:opacity-60"><Icon name="refresh" size={15} /> {t("بازگردانی")}</button>}
                      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn-wa size-sm"><Icon name="chat" size={15} /> {t("واتساپ")}</a>}
                      {wa && <a href={`https://t.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn-tg size-sm"><Icon name="send" size={15} /> {t("تلگرام")}</a>}
                      {x.phone && <a href={`tel:${x.phone}`} className="btn-ghost size-sm"><Icon name="phone" size={15} /> {t("تماس")}</a>}
                    </div>

                    <CustomerFile history={customerHistory(data.ok ? data.related : quotes, x)} fmtDate={fmtDate} />
                    {notifyFailed(x) && canStatus && <RetryNotice quote={x} now={now} saving={savingId === x.id && pending} onRetry={() => retryNotice(x.id)} />}
                    {canStatus && <FollowUpBox quote={x} saving={savingId === x.id && pending} onSave={(d) => saveFollowUp(x.id, d)} />}
                    {canAssign && <AssigneeBox quote={x} saving={savingId === x.id && pending} suggestions={assignees} onSave={(v) => saveAssignee(x.id, v)} />}
                    {canStatus
                      ? <NotesBox quote={x} saving={savingId === x.id && pending} onSave={(v) => saveNotes(x.id, v)} />
                      : x.internal_notes && <div className="rounded-xl bg-canvas-soft border border-line p-3 text-sm text-ink-soft whitespace-pre-wrap">{x.internal_notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data.ok && data.total > 0 && <ListPager data={data} href={nav.href} onSize={(size) => nav.go({ size })} />}

      {deleting && (
        <DeleteQuoteModal
          quote={deleting}
          statusLabel={QUOTE_STATUS_FA[deleting.status] ? t(QUOTE_STATUS_FA[deleting.status]) : deleting.status}
          onClose={() => setDeleting(null)}
          onDelete={actions.deleteQuote}
          onDone={(res) => afterDelete([deleting.id], res.ok ? { ...res, count: 1 } : res)}
        />
      )}

      {bulkDeleting && (
        <BulkDeleteQuotesModal
          quotes={selectedRows}
          onClose={() => setBulkDeleting(false)}
          onDelete={actions.deleteQuotes}
          onDone={(res) => afterDelete(res.ok ? res.deletedIds : selectedRows.map((x) => x.id), res)}
        />
      )}
      {confirm && <ConfirmFiltered total={data.total} filters={t("زبانهٔ «{tab}» و فیلترهای فعلی", { tab: t(TABS.find((x) => x.id === tab)?.label || "") })} what={confirm.what} busy={confirmBusy} onConfirm={runFiltered} onCancel={() => setConfirm(null)} num={num} />}
    </>
  );
}

function Detail({ label, value, ltr }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-ink-faint shrink-0">{label}:</span>
      <span className="text-ink-soft truncate" dir={ltr ? "ltr" : "rtl"}>{value}</span>
    </div>
  );
}

function AssigneeBox({ quote, saving, suggestions, onSave }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const server = quote.assigned_to || "";
  const [v, setV] = useState(server);
  const [base, setBase] = useState(server);   // the server value this box last followed
  // Same rule as the notes box: a change made in another session is followed while the field is untouched; text the
  // user is typing is never overwritten.
  useEffect(() => {
    if (server === base) return;
    const dirty = v !== base;
    if (!dirty) setV(server);
    setBase(server);
  }, [server]); // eslint-disable-line react-hooks/exhaustive-deps
  const listId = `assignees-${quote.id}`;
  return (
    <div className="mb-4">
      <span className="block text-[12px] font-medium text-ink-soft mb-1.5">{t("مسئول پیگیری")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} maxLength={60} list={listId} placeholder={t("نام مسئول (مثلاً سارا)")} aria-label={t("مسئول پیگیری")} className="input min-w-0 flex-1 basis-40 !h-9 text-sm" />
        <datalist id={listId}>{suggestions.map((n) => <option key={n} value={n} />)}</datalist>
        <button type="button" onClick={() => onSave(v)} disabled={saving || v.trim() === (quote.assigned_to || "")} className="btn-ghost size-sm disabled:opacity-60">{saving ? <Spinner /> : <Icon name="save" size={15} />} {t("ذخیره مسئول")}</button>
      </div>
    </div>
  );
}

function NotesBox({ quote, saving, onSave }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const server = quote.internal_notes || "";
  const [v, setV] = useState(server);
  const [base, setBase] = useState(server);   // the server text this box last followed
  // New text from the server (another session saved a note) is followed only while the box is untouched; text the
  // user is typing (dirty) is never overwritten.
  useEffect(() => {
    if (server === base) return;
    const dirty = v !== base;
    if (!dirty) setV(server);
    setBase(server);
  }, [server]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <span className="block text-[12px] font-medium text-ink-soft mb-1.5">{t("یادداشت داخلی (فقط برای تیم)")}</span>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={2} className="input w-full !h-auto py-2 text-sm" placeholder={t("یادداشت پیگیری…")} />
      <button type="button" onClick={() => onSave(v)} disabled={saving} className="btn-ghost size-sm mt-2">{saving ? <Spinner /> : <Icon name="save" size={15} />} {t("ذخیره یادداشت")}</button>
    </div>
  );
}

function FollowUpBox({ quote, saving, onSave }) {
  const t = useT();
  const server = quote.follow_up_at ? String(quote.follow_up_at).slice(0, 10) : "";
  const [v, setV] = useState(server);
  const [base, setBase] = useState(server);
  useEffect(() => {
    if (server === base) return;
    if (v === base) setV(server);
    setBase(server);
  }, [server]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mb-4" data-testid="followup-box">
      <span className="block text-[12px] font-medium text-ink-soft mb-1.5">{t("تاریخ پیگیری")}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={v} onChange={(e) => setV(e.target.value)} dir="ltr" aria-label={t("تاریخ پیگیری")} className="input min-w-0 !h-9 text-sm w-auto" />
        <button type="button" onClick={() => onSave(v)} disabled={saving || v === server} className="btn-ghost size-sm disabled:opacity-60">{saving ? <Spinner /> : <Icon name="save" size={15} />} {t("ذخیره پیگیری")}</button>
        {server && <button type="button" onClick={() => { setV(""); onSave(""); }} disabled={saving} className="btn-ghost size-sm disabled:opacity-60">{t("برداشتن")}</button>}
      </div>
    </div>
  );
}

function RetryNotice({ quote, now, saving, onRetry }) {
  const t = useT();
  const st = retryState(quote, now);
  return (
    <div className="mb-4 rounded-xl border border-warn/30 bg-warn/5 p-3 flex flex-wrap items-center gap-2" data-testid="retry-notice">
      <span className="text-sm text-ink-soft min-w-0 flex-1 basis-48">{t("اعلان تلگرام این درخواست نرسیده است.")}</span>
      <button type="button" onClick={onRetry} disabled={saving || !st.allowed} className="btn-ghost size-sm disabled:opacity-60">{saving ? <Spinner /> : <Icon name="refresh" size={15} />} {t("ارسال دوباره اعلان")}</button>
    </div>
  );
}

// the customer file: other requests with the same phone number (the requests are the file; nothing else is stored)
function CustomerFile({ history, fmtDate }) {
  const t = useT();
  if (!history.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-line p-3" data-testid="customer-file">
      <p className="text-[12px] font-medium text-ink-soft mb-2">{t("سابقهٔ این مشتری ({count} درخواست دیگر)", { count: history.length })}</p>
      <ul className="text-xs text-ink-muted flex flex-col gap-1">
        {history.map((h) => (
          <li key={h.id} className="flex flex-wrap gap-x-3 min-w-0 break-words">
            <span dir="ltr">{h.tracking_code || `#${h.id}`}</span><span>{fmtDate(h.created_at)}</span><span>{QUOTE_STATUS_FA[h.status] ? t(QUOTE_STATUS_FA[h.status]) : h.status}</span><span className="min-w-0 break-words">{h.product_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
