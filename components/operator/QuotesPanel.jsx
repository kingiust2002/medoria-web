"use client";
// The Quotes screen of BOTH operator panels (Health and Beauty). Each panel's
// QuotesManager.jsx passes its own server actions, so the screen itself never
// knows which table it touches. Tabs (active / archive / spam / all), tick
// selection and bulk actions (archive, spam, restore, delete) live here once.
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { QUOTE_STATUSES, QUOTE_ACTIVE_STATUSES, QUOTE_STATUS_FA, QUOTE_STATUS_TONE, CONTACT_FA, LANG_FA } from "@/lib/operator/constants";
import { PageHeader, Input, Select, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import DeleteQuoteModal from "@/components/operator/DeleteQuoteModal";
import BulkDeleteQuotesModal from "@/components/operator/BulkDeleteQuotesModal";

const digits = (s) => String(s || "").replace(/[^\d]/g, "");
function faDate(v) { try { return new Date(v).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); } catch { return "—"; } }

const TABS = [
  { id: "active", label: "فعال" },
  { id: "archived", label: "آرشیو" },
  { id: "spam", label: "اسپم" },
  { id: "all", label: "همه" },
];
const inTab = (x, tab) => (tab === "all" ? true : tab === "active" ? x.status !== "archived" && x.status !== "spam" : x.status === tab);
const MOVED = { archived: "به آرشیو منتقل شد", spam: "به اسپم منتقل شد", new: "بازگردانی شد" };

export default function QuotesPanel({ quotes: initial, actions }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState(initial);
  const [tab, setTab] = useState("active");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [deleting, setDeleting] = useState(null);       // one quote
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [pending, startTransition] = useTransition();
  const allRef = useRef(null);

  const counts = useMemo(() => { const c = {}; for (const x of quotes) c[x.status] = (c[x.status] || 0) + 1; return c; }, [quotes]);
  const tabCounts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, quotes.filter((x) => inTab(x, t.id)).length])), [quotes]);
  const statusOptions = tab === "active" ? QUOTE_ACTIVE_STATUSES : tab === "all" ? QUOTE_STATUSES : [];

  const rows = useMemo(() => {
    let list = quotes.filter((x) => inTab(x, tab));
    const n = q.trim().toLowerCase();
    if (n) list = list.filter((x) => [x.name, x.phone, x.product_name, x.organization].filter(Boolean).some((v) => String(v).toLowerCase().includes(n)));
    if (status) list = list.filter((x) => x.status === status);
    return list;
  }, [quotes, tab, q, status]);

  // Only rows that are on screen can be selected: a filter change can never leave
  // a hidden row inside a bulk action.
  const selectedRows = useMemo(() => rows.filter((x) => selected.has(x.id)), [rows, selected]);
  const allChecked = rows.length > 0 && selectedRows.length === rows.length;
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = selectedRows.length > 0 && !allChecked; }, [selectedRows.length, allChecked]);

  function flash(text, ok = false) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4500); }
  function patch(id, fields) { setQuotes((qs) => qs.map((x) => (x.id === id ? { ...x, ...fields } : x))); }
  function goTab(id) { setTab(id); setStatus(""); setSelected(new Set()); setOpenId(null); }
  function toggle(id) { setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setSelected(allChecked ? new Set() : new Set(rows.map((x) => x.id))); }

  function changeStatus(id, val, okText) {
    const prev = quotes.find((x) => x.id === id)?.status;
    patch(id, { status: val });
    startTransition(async () => {
      const res = await actions.updateQuoteStatus(id, val);
      if (!res.ok) { patch(id, { status: prev }); flash(res.error); }
      else if (okText) flash(okText, true);
    });
  }
  function saveNotes(id, notes) {
    setSavingId(id);
    startTransition(async () => {
      const res = await actions.updateQuoteNotes(id, notes);
      setSavingId(null);
      if (res.ok) flash("یادداشت ذخیره شد.", true); else flash(res.error);
    });
  }

  function bulkStatus(val) {
    const ids = selectedRows.map((x) => x.id);
    startTransition(async () => {
      const res = await actions.updateQuotesStatus(ids, val);
      if (!res.ok) { flash(res.error); if (res.notFound) router.refresh(); return; }
      const done = new Set(res.updatedIds || ids);
      setQuotes((qs) => qs.map((x) => (done.has(x.id) ? { ...x, status: val } : x)));
      setSelected(new Set());
      flash(`${res.count} درخواست ${MOVED[val] || "تغییر کرد"}.${res.missing ? ` (${res.missing} مورد دیگر پیدا نشد.)` : ""}`, true);
      router.refresh();
    });
  }

  function afterDelete(gone, res) {
    const ids = new Set(gone);
    setQuotes((qs) => qs.filter((x) => !ids.has(x.id)));
    setOpenId((cur) => (ids.has(cur) ? null : cur));
    setSelected((s) => { const n = new Set(s); for (const id of ids) n.delete(id); return n; });
    setDeleting(null); setBulkDeleting(false);
    if (res?.ok) flash(res.count > 1 ? `${res.count} درخواست حذف شد.${res.missing ? ` (${res.missing} مورد دیگر پیدا نشد.)` : ""}` : "درخواست حذف شد.", true);
    else flash(res?.error);
    router.refresh();
  }

  const nActive = tabCounts.active, nArch = tabCounts.archived, nSpam = tabCounts.spam;

  return (
    <>
      <PageHeader title="استعلام‌ها" subtitle={`${nActive} فعال · ${nArch} آرشیو · ${nSpam} اسپم`} />

      <div role="tablist" aria-label="دسته‌بندی استعلام‌ها" className="flex flex-wrap gap-2 mb-3">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => goTab(t.id)}
              className={`btn-ghost size-sm ${on ? "!border-brand-violet/60 !text-brand-violet !bg-brand-violet/5" : ""}`}>
              {t.label} <span className="text-ink-faint tabular">{tabCounts[t.id]}</span>
            </button>
          );
        })}
      </div>

      <div className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={16} /></span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو: نام، تلفن، محصول…" className="pr-9" />
        </div>
        {statusOptions.length > 0 && (
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[150px]">
            <option value="">همه وضعیت‌ها</option>
            {statusOptions.map((s) => <option key={s} value={s}>{QUOTE_STATUS_FA[s]} ({counts[s] || 0})</option>)}
          </Select>
        )}
        {rows.length > 0 && (
          <label className="inline-flex items-center gap-2 text-sm text-ink-soft cursor-pointer select-none">
            <input ref={allRef} type="checkbox" checked={allChecked} onChange={toggleAll} className="w-4 h-4 accent-brand-violet" />
            انتخاب همه ({rows.length})
          </label>
        )}
      </div>

      {selectedRows.length > 0 && (
        <div role="region" aria-label="عملیات گروهی" className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2 border border-brand-violet/30">
          <span className="text-sm font-medium text-ink">{selectedRows.length} مورد انتخاب شده</span>
          <div className="flex flex-wrap items-center gap-2 ms-auto">
            {tab !== "archived" && <button type="button" disabled={pending} onClick={() => bulkStatus("archived")} className="btn-ghost size-sm disabled:opacity-60"><Icon name="archive" size={15} /> آرشیو</button>}
            {tab !== "spam" && <button type="button" disabled={pending} onClick={() => bulkStatus("spam")} className="btn-ghost size-sm disabled:opacity-60"><Icon name="alertTriangle" size={15} /> اسپم</button>}
            {(tab === "archived" || tab === "spam" || tab === "all") && <button type="button" disabled={pending} onClick={() => bulkStatus("new")} className="btn-ghost size-sm disabled:opacity-60"><Icon name="refresh" size={15} /> بازگردانی به «جدید»</button>}
            <button type="button" disabled={pending} onClick={() => setBulkDeleting(true)} className="btn-ghost size-sm !text-warn hover:!border-warn/40 disabled:opacity-60"><Icon name="trash" size={15} /> حذف</button>
            <button type="button" onClick={() => setSelected(new Set())} className="btn-ghost size-sm">لغو انتخاب</button>
          </div>
        </div>
      )}

      {msg && (
        <div role="status" className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> {msg.text}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="quote" title="استعلامی یافت نشد" desc={tab === "archived" ? "آرشیو خالی است." : tab === "spam" ? "اسپمی ثبت نشده است." : "هنوز درخواستی ثبت نشده یا با فیلتر مطابقت ندارد."} />
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
                <label className="grid place-items-center w-11 shrink-0 cursor-pointer border-l border-line hover:bg-line-soft/40 transition-colors" title="انتخاب">
                  <input type="checkbox" checked={isSel} onChange={() => toggle(x.id)} aria-label={`انتخاب ${x.name || "درخواست"}`} className="w-4 h-4 accent-brand-violet" />
                </label>
                <button onClick={() => setOpenId(open ? null : x.id)} className="min-w-0 flex-1 px-4 py-3.5 flex items-center gap-3 text-right hover:bg-line-soft/40 transition-colors">
                  <span className="hidden sm:grid place-items-center w-10 h-10 rounded-xl bg-brand-violet/10 text-brand-violet shrink-0"><Icon name="user" size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">{x.name || "بدون نام"}{x.organization ? <span className="text-ink-faint font-normal"> · {x.organization}</span> : null}</p>
                    <p className="text-xs text-ink-muted truncate mt-0.5">{x.product_name || "درخواست عمومی"} · {faDate(x.created_at)}</p>
                  </div>
                  <Badge tone={QUOTE_STATUS_TONE[x.status] || "neutral"}>{QUOTE_STATUS_FA[x.status] || x.status}</Badge>
                  <Icon name="chevronDown" size={16} className={`text-ink-faint transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
                </button>
                <button type="button" onClick={() => setDeleting(x)} title="حذف درخواست" aria-label={`حذف درخواست ${x.name || ""}`.trim()} className="grid place-items-center w-12 shrink-0 border-r border-line text-ink-muted hover:bg-warn/10 hover:text-warn transition-colors"><Icon name="trash" size={17} /></button>
                </div>

                {open && (
                  <div className="px-4 pb-4 border-t border-line">
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm py-3.5">
                      <Detail label="تلفن" value={x.phone} ltr />
                      <Detail label="کانال ترجیحی" value={CONTACT_FA[x.preferred_contact] || x.preferred_contact} />
                      <Detail label="کد محصول" value={x.product_sku} ltr />
                      <Detail label="تعداد" value={x.quantity} />
                      <Detail label="زبان" value={LANG_FA[x.language] || x.language} />
                      <Detail label="صفحه مبدأ" value={x.source_url} ltr />
                    </div>
                    {Array.isArray(x.items) && x.items.length > 0 && (
                      <div className="rounded-xl border border-line mb-3 overflow-hidden">
                        <p className="px-3 py-2 text-[12px] font-medium text-ink-soft bg-canvas-soft border-b border-line">محصولات درخواستی ({x.items.length})</p>
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
                      <Select value={x.status} onChange={(e) => changeStatus(x.id, e.target.value)} className="w-auto !h-9 text-xs">
                        {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{QUOTE_STATUS_FA[s]}</option>)}
                      </Select>
                      {x.status !== "archived" && <button type="button" disabled={pending} onClick={() => changeStatus(x.id, "archived", `درخواست ${MOVED.archived}.`)} className="btn-ghost size-sm disabled:opacity-60"><Icon name="archive" size={15} /> آرشیو</button>}
                      {x.status !== "spam" && <button type="button" disabled={pending} onClick={() => changeStatus(x.id, "spam", `درخواست ${MOVED.spam}.`)} className="btn-ghost size-sm disabled:opacity-60"><Icon name="alertTriangle" size={15} /> اسپم</button>}
                      {parked && <button type="button" disabled={pending} onClick={() => changeStatus(x.id, "new", `درخواست ${MOVED.new}.`)} className="btn-ghost size-sm disabled:opacity-60"><Icon name="refresh" size={15} /> بازگردانی</button>}
                      {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn-wa size-sm"><Icon name="chat" size={15} /> واتساپ</a>}
                      {wa && <a href={`https://t.me/${wa}`} target="_blank" rel="noopener noreferrer" className="btn-tg size-sm"><Icon name="send" size={15} /> تلگرام</a>}
                      {x.phone && <a href={`tel:${x.phone}`} className="btn-ghost size-sm"><Icon name="phone" size={15} /> تماس</a>}
                    </div>

                    <NotesBox quote={x} saving={savingId === x.id && pending} onSave={(v) => saveNotes(x.id, v)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {deleting && (
        <DeleteQuoteModal
          quote={deleting}
          statusLabel={QUOTE_STATUS_FA[deleting.status] || deleting.status}
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

function NotesBox({ quote, saving, onSave }) {
  const [v, setV] = useState(quote.internal_notes || "");
  return (
    <div>
      <span className="block text-[12px] font-medium text-ink-soft mb-1.5">یادداشت داخلی (فقط برای تیم)</span>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={2} className="input w-full !h-auto py-2 text-sm" placeholder="یادداشت پیگیری…" />
      <button type="button" onClick={() => onSave(v)} disabled={saving} className="btn-ghost size-sm mt-2">{saving ? <Spinner /> : <Icon name="save" size={15} />} ذخیره یادداشت</button>
    </div>
  );
}
