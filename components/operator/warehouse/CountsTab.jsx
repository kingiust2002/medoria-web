"use client";
// components/operator/warehouse/CountsTab.jsx — the "stock counts" tab of the warehouse screen (both panels): the list of counts, and one
// count: type what was counted, see the differences, close it (the differences are posted as stock adjustments — directly or, for a person
// whose policy says so, as a request a reviewer approves) or cancel it. Buttons follow the person's rights; the server asks again.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Field, Input, Select, Textarea, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import CsvButton from "@/components/operator/warehouse/CsvButton";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan, useMode } from "@/components/panel/Capabilities";
import { countDelta, parseCounted } from "@/lib/warehouse/countsCore";
import { tr } from "@/lib/panel/i18n";

const STATUS = { open: { label: tr("باز"), tone: "info" }, closed: { label: tr("بسته"), tone: "ok" }, cancelled: { label: tr("لغو شده"), tone: "neutral" } };
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "—");
const sign = (n) => (n > 0 ? "+" : "") + fmt(n);

function Msg({ msg }) {
  return msg ? <div role={msg.ok ? "status" : "alert"} className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}><Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> <span className="min-w-0 break-words">{msg.text}</span></div> : null;
}

function StartForm({ locations, actions, onStarted, onCancel }) {
  const t = useT();
  const active = locations.filter((l) => l.is_active);
  const [loc, setLoc] = useState(String(active[0]?.id ?? ""));
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  function submit(e) {
    e.preventDefault(); setErr("");
    start(async () => {
      const res = await actions.startCount({ locationId: loc, note });
      if (res.ok) onStarted(res.id); else setErr(t(res.error, res.params));
    });
  }
  return (
    <form onSubmit={submit} className="card p-4 mb-4 grid gap-3 max-w-lg" data-testid="wh-count-start-form">
      <Msg msg={err ? { ok: false, text: err } : null} />
      <Field label={t("انبار")} required>
        <Select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label={t("انبار")}>{active.map((l) => <option key={l.id} value={String(l.id)}>{l.code} — {l.name}</option>)}</Select>
      </Field>
      <Field label={t("توضیح")}><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} aria-label={t("توضیح")} /></Field>
      <p className="text-xs text-ink-muted">{t("موجودی فعلی این انبار به‌عنوان «مورد انتظار» ثبت می‌شود؛ تغییرهای بعدی انبار روی آن اثر نمی‌گذارد.")}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !loc} className="btn-primary size-md disabled:opacity-60" data-testid="wh-count-start">{pending ? <Spinner /> : <Icon name="plus" size={17} />} {t("شروع شمارش")}</button>
        <button type="button" onClick={onCancel} className="btn-ghost size-md">{t("انصراف")}</button>
      </div>
    </form>
  );
}

function CountList({ data, actions, base, code }) {
  const t = useT();
  const router = useRouter();
  const { date: fmtDate } = usePanelLang();
  const canStart = useCan("inventory.count_start");
  const [form, setForm] = useState(false);
  const hasActive = data.locations.some((l) => l.is_active);
  return (
    <>
      {data.countError && <Msg msg={{ ok: false, text: t(data.countError) }} />}
      {canStart && hasActive && !form && <div className="mb-3"><button type="button" className="btn-primary size-md" onClick={() => setForm(true)} data-testid="wh-count-new"><Icon name="plus" size={17} /> {t("شمارش جدید")}</button></div>}
      {form && <StartForm locations={data.locations} actions={actions} onCancel={() => setForm(false)} onStarted={(id) => router.push(`${base}?tab=counts&count=${id}`)} />}
      {data.list.length === 0 && !data.countError ? <EmptyState icon="list" title={t("هنوز شمارشی انجام نشده")} desc={t("با «شمارش جدید» موجودی واقعی یک انبار را با سیستم مقایسه کنید.")} /> : (
        <div className="card divide-y divide-line overflow-hidden" data-testid="wh-counts">
          {data.list.map((c) => (
            <Link key={c.id} href={`${base}?tab=counts&count=${c.id}`} data-testid="wh-count-row" className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0 hover:bg-line-soft/50">
              <Badge tone={STATUS[c.status]?.tone}>{t(STATUS[c.status]?.label || c.status)}</Badge>
              <div className="min-w-0 flex-1 basis-44">
                <p className="text-sm text-ink truncate">#{c.id} · <span dir="ltr">{code(c.locationId)}</span>{c.note ? ` · ${c.note}` : ""}</p>
                <p className="text-xs text-ink-muted break-words">{[c.who, fmtDate(c.at)].filter(Boolean).join(" · ")}</p>
              </div>
              {c.status === "closed" && c.differences != null && <span className="text-xs tabular text-ink-muted">{t("{n} اختلاف", { n: c.differences })}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function CountDetail({ data, actions, base, code }) {
  const t = useT();
  const router = useRouter();
  const { date: fmtDate } = usePanelLang();
  const c = data.count;
  const canEdit = useCan("inventory.count_start") && c.status === "open";
  const canExport = useCan("inventory.export");
  const closeMode = useMode("inventory.count_close");
  const [vals, setVals] = useState(() => Object.fromEntries(data.lines.map((l) => [l.productId, l.counted == null ? "" : String(l.counted)])));
  const [msg, setMsg] = useState(null);
  const [add, setAdd] = useState({ sku: "", counted: "" });
  const [pending, start] = useTransition();
  const saved = useMemo(() => Object.fromEntries(data.lines.map((l) => [l.productId, l.counted == null ? "" : String(l.counted)])), [data.lines]);
  const dirty = data.lines.filter((l) => (vals[l.productId] ?? "") !== saved[l.productId]);
  const bad = data.lines.some((l) => !parseCounted(vals[l.productId] ?? "").ok);

  const rowDelta = (l) => {
    const p = parseCounted(vals[l.productId] ?? "");
    return p.ok ? countDelta(l.expected, p.value) : null;
  };
  const live = data.lines.map(rowDelta);
  const countedN = live.filter((d) => d != null).length, diffN = live.filter((d) => d != null && d !== 0).length;

  const fail = (res) => setMsg({ ok: false, text: t(res.error, res.params) + (res.failed?.length ? ` — ${res.failed.map((f) => f.sku).join(", ")}` : "") });
  const saveDirty = async () => {
    if (!dirty.length) return { ok: true };
    return actions.saveCounted({ countId: c.id, entries: dirty.map((l) => ({ productId: l.productId, counted: vals[l.productId] })) });
  };
  const run = (fn) => start(async () => { setMsg(null); await fn(); });

  const save = () => run(async () => {
    const r = await saveDirty();
    if (!r.ok) return fail(r);
    setMsg({ ok: true, text: t("ذخیره شد.") }); router.refresh();
  });
  const close = () => run(async () => {
    const s = await saveDirty();
    if (!s.ok) return fail(s);
    const r = await actions.closeCount({ countId: c.id });
    if (!r.ok) { router.refresh(); return fail(r); }
    setMsg({ ok: true, text: r.pending ? t(r.message) : t("شمارش بسته شد و اختلاف‌ها ثبت شد.") }); router.refresh();
  });
  const cancel = () => run(async () => {
    const r = await actions.cancelCount({ countId: c.id });
    if (!r.ok) return fail(r);
    router.push(`${base}?tab=counts`);
  });
  const addLine = () => run(async () => {
    const r = await actions.addCountLine({ countId: c.id, sku: add.sku, counted: add.counted });
    if (!r.ok) return fail(r);
    setAdd({ sku: "", counted: "" }); router.refresh();
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href={`${base}?tab=counts`} className="btn-ghost size-sm"><Icon name="arrowL" size={16} /> {t("همهٔ شمارش‌ها")}</Link>
        <h2 className="font-bold text-ink min-w-0 break-words">{t("شمارش")} #{c.id} · <span dir="ltr">{code(c.locationId)}</span></h2>
        <Badge tone={STATUS[c.status]?.tone} data-testid="wh-count-status">{t(STATUS[c.status]?.label || c.status)}</Badge>
        {canExport && <CsvButton testId="wh-count-csv" run={() => actions.exportCountCsv({ countId: c.id })} />}
      </div>
      <p className="text-xs text-ink-muted mb-3 break-words">{[c.note, c.who, fmtDate(c.at), c.closedAt ? `${t("بسته شد")}: ${fmtDate(c.closedAt)}${c.closedWho ? ` (${c.closedWho})` : ""}` : ""].filter(Boolean).join(" · ")}</p>
      <Msg msg={msg} />
      <p className="text-sm text-ink-soft mb-3" data-testid="wh-count-summary">{t("{counted} از {total} ردیف شمارش شده · {diff} اختلاف", { counted: c.status === "open" ? countedN : data.summary.counted, total: data.lines.length, diff: c.status === "open" ? diffN : data.summary.differences })}</p>

      {data.lines.length === 0 ? <EmptyState icon="package" title={t("این انبار موجودی ثبت‌شده‌ای نداشت")} desc={canEdit ? t("محصولی را که روی قفسه می‌بینید، پایین اضافه کنید.") : undefined} /> : (
        <div className="card divide-y divide-line overflow-hidden" data-testid="wh-count-lines">
          {data.lines.map((l, i) => {
            const d = live[i];
            return (
              <div key={l.productId} data-testid="wh-count-line" data-sku={l.sku} className="px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                <div className="min-w-0 flex-1 basis-44">
                  <p className="text-sm font-medium text-ink truncate"><span dir="ltr">{l.sku}</span>{l.name && <span className="text-ink-muted font-normal"> · {l.name}</span>}</p>
                  <p className="text-xs text-ink-muted">{t("مورد انتظار")}: <span className="tabular" dir="ltr">{fmt(l.expected)}</span></p>
                </div>
                {canEdit ? (
                  <Input value={vals[l.productId] ?? ""} onChange={(e) => setVals((s) => ({ ...s, [l.productId]: e.target.value }))} inputMode="decimal" dir="ltr" placeholder="—" aria-label={`${t("شمارش‌شده")} ${l.sku}`} className="!w-28 text-end" data-testid="wh-count-input" />
                ) : (
                  <span className="tabular text-sm w-28 text-end" dir="ltr">{l.counted == null ? "—" : fmt(l.counted)}</span>
                )}
                <span className={`tabular text-sm w-20 text-end ${d ? (d > 0 ? "text-ok" : "text-warn") : "text-ink-faint"}`} dir="ltr" data-testid="wh-count-diff">{d == null ? "" : sign(d)}</span>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="mt-4 grid gap-3">
          <div className="card-flat p-3 flex flex-wrap items-end gap-2">
            <Field label={t("افزودن محصول خارج از فهرست (SKU)")}><Input value={add.sku} onChange={(e) => setAdd((s) => ({ ...s, sku: e.target.value }))} dir="ltr" maxLength={80} className="!w-48" aria-label={t("کد کالا (SKU)")} data-testid="wh-count-add-sku" /></Field>
            <Field label={t("شمارش‌شده")}><Input value={add.counted} onChange={(e) => setAdd((s) => ({ ...s, counted: e.target.value }))} inputMode="decimal" dir="ltr" className="!w-28" aria-label={t("شمارش‌شده")} data-testid="wh-count-add-qty" /></Field>
            <button type="button" disabled={pending || !add.sku.trim()} className="btn-ghost size-md" onClick={addLine} data-testid="wh-count-add">{t("افزودن")}</button>
          </div>
          {closeMode === "approval" && <p className="text-sm rounded-xl px-3 py-2.5 bg-primary/10 text-primary" data-testid="wh-count-approval-note">{t("بستن این شمارش پس از تأیید مسئول اعمال می‌شود.")}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending || !dirty.length || bad} className="btn-ghost size-md disabled:opacity-60" onClick={save} data-testid="wh-count-save">{pending ? <Spinner /> : <Icon name="save" size={17} />} {t("ذخیرهٔ شمارش")}</button>
            {closeMode !== "denied" && (
              <button type="button" disabled={pending || bad || (!countedN)} className="btn-primary size-md disabled:opacity-60" onClick={close} data-testid="wh-count-close">
                {closeMode === "approval" ? t("ارسال برای تأیید بستن") : t("بستن شمارش و ثبت اختلاف‌ها")}
              </button>
            )}
            <button type="button" disabled={pending} className="btn-ghost size-md !text-warn" onClick={cancel} data-testid="wh-count-cancel">{t("لغو شمارش")}</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function CountsTab({ data, actions, base, code }) {
  return data.count ? <CountDetail key={data.count.id + data.count.status + data.lines.length} data={data} actions={actions} base={base} code={code} /> : <CountList data={data} actions={actions} base={base} code={code} />;
}
