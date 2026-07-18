"use client";
import { useMemo, useState, useTransition } from "react";
import Icon from "@/components/shared/Icon";
import { updateQuoteStatus, updateQuoteNotes } from "@/lib/beauty/operator/actions";
import { QUOTE_STATUSES, QUOTE_STATUS_FA, QUOTE_STATUS_TONE, CONTACT_FA, LANG_FA } from "@/lib/beauty/operator/constants";
import { PageHeader, Input, Select, Badge, EmptyState, Spinner } from "@/components/operator/ui";

const digits = (s) => String(s || "").replace(/[^\d]/g, "");
function faDate(v) { try { return new Date(v).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); } catch { return "—"; } }

export default function QuotesManager({ quotes: initial }) {
  const [quotes, setQuotes] = useState(initial);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [openId, setOpenId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => { const c = {}; for (const x of quotes) c[x.status] = (c[x.status] || 0) + 1; return c; }, [quotes]);

  const rows = useMemo(() => {
    let list = [...quotes];
    const n = q.trim().toLowerCase();
    if (n) list = list.filter((x) => [x.name, x.phone, x.product_name, x.organization].filter(Boolean).some((v) => String(v).toLowerCase().includes(n)));
    if (status) list = list.filter((x) => x.status === status);
    return list;
  }, [quotes, q, status]);

  function flash(text, ok = false) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); }
  function patch(id, fields) { setQuotes((qs) => qs.map((x) => (x.id === id ? { ...x, ...fields } : x))); }

  function changeStatus(id, val) {
    const prev = quotes.find((x) => x.id === id)?.status;
    patch(id, { status: val });
    startTransition(async () => {
      const res = await updateQuoteStatus(id, val);
      if (!res.ok) { patch(id, { status: prev }); flash(res.error); }
    });
  }
  function saveNotes(id, notes) {
    setSavingId(id);
    startTransition(async () => {
      const res = await updateQuoteNotes(id, notes);
      setSavingId(null);
      if (res.ok) flash("یادداشت ذخیره شد.", true); else flash(res.error);
    });
  }

  return (
    <>
      <PageHeader title="استعلام‌ها" subtitle={`${quotes.length} درخواست`} />

      <div className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={16} /></span>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو: نام، تلفن، محصول…" className="pr-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[150px]">
          <option value="">همه وضعیت‌ها</option>
          {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{QUOTE_STATUS_FA[s]} ({counts[s] || 0})</option>)}
        </Select>
      </div>

      {msg && (
        <div className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
          <Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> {msg.text}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="quote" title="استعلامی یافت نشد" desc="هنوز درخواستی ثبت نشده یا با فیلتر مطابقت ندارد." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((x) => {
            const open = openId === x.id;
            const wa = digits(x.phone);
            return (
              <div key={x.id} className="card overflow-hidden">
                <button onClick={() => setOpenId(open ? null : x.id)} className="w-full px-4 py-3.5 flex items-center gap-3 text-right hover:bg-line-soft/40 transition-colors">
                  <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-violet/10 text-brand-violet shrink-0"><Icon name="user" size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink truncate">{x.name || "بدون نام"}{x.organization ? <span className="text-ink-faint font-normal"> · {x.organization}</span> : null}</p>
                    <p className="text-xs text-ink-muted truncate mt-0.5">{x.product_name || "درخواست عمومی"} · {faDate(x.created_at)}</p>
                  </div>
                  <Badge tone={QUOTE_STATUS_TONE[x.status] || "neutral"}>{QUOTE_STATUS_FA[x.status] || x.status}</Badge>
                  <Icon name="chevronDown" size={16} className={`text-ink-faint transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
                </button>

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
                    {x.message && <div className="rounded-xl bg-canvas-soft border border-line p-3 text-sm text-ink-soft leading-relaxed mb-3 whitespace-pre-wrap">{x.message}</div>}

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Select value={x.status} onChange={(e) => changeStatus(x.id, e.target.value)} className="w-auto !h-9 text-xs">
                        {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{QUOTE_STATUS_FA[s]}</option>)}
                      </Select>
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
