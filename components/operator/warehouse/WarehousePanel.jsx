"use client";
// components/operator/warehouse/WarehousePanel.jsx — the internal warehouse screen of BOTH panels (stock, movements, reservations,
// warehouses). Each panel's page passes its own server actions and base path, so this file never knows which house it shows.
// Buttons appear only for what the person may do (useCan); the server decides again on every action. Every movement form carries an
// idempotency key made when the form opens, so a double click or a retry after a timeout cannot post twice.
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { PageHeader, Field, Input, Select, Textarea, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import CountsTab from "@/components/operator/warehouse/CountsTab";
import CsvButton from "@/components/operator/warehouse/CsvButton";
import TabPager from "@/components/operator/warehouse/TabPager";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan, useMode } from "@/components/panel/Capabilities";
import { tr } from "@/lib/panel/i18n";

const TABS = [
  { id: "stock", label: tr("موجودی") },
  { id: "movements", label: tr("حرکت‌ها") },
  { id: "reservations", label: tr("رزروها") },
  { id: "counts", label: tr("شمارش") },
  { id: "locations", label: tr("انبارها") },
];
const KIND_LABEL = { receive: tr("ورود"), issue: tr("خروج"), transfer: tr("انتقال"), adjust: tr("اصلاح"), reversal: tr("برگشت") };
const KIND_TONE = { receive: "ok", issue: "warn", transfer: "violet", adjust: "neutral", reversal: "muted" };
const FORM_TITLE = { receive: tr("ورود کالا به انبار"), issue: tr("خروج کالا از انبار"), transfer: tr("انتقال بین انبارها"), adjust: tr("اصلاح موجودی"), reserve: tr("رزرو موجودی") };

const newKey = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "—");

function Modal({ title, onClose, children }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative card p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-auto animate-fade-in min-w-0">
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
  return children ? <div role="alert" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> <span className="min-w-0 break-words">{children}</span></div> : null;
}

// kind: receive | issue | transfer | adjust | reserve. `item` (optional): the product row the button belonged to.
function MovementModal({ kind, item, locations, actions, onClose, onDone }) {
  const t = useT();
  const key = useRef(newKey());
  const active = locations.filter((l) => l.is_active);
  const [sku, setSku] = useState(item?.sku || "");
  const [loc, setLoc] = useState(String(active[0]?.id ?? ""));
  const [to, setTo] = useState(String(active[1]?.id ?? ""));
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const adjustMode = useMode("inventory.adjust");
  const approval = kind === "adjust" && adjustMode === "approval";

  function submit(e) {
    e.preventDefault();
    setErr("");
    start(async () => {
      const common = { key: key.current, locationId: loc, qty, ...(item ? { productId: item.productId } : { sku }) };
      const res = kind === "reserve"
        ? await actions.reserveStock({ ...common, reference, note: reason })
        : await actions.postMovement({ ...common, kind, toLocationId: kind === "transfer" ? to : undefined, reason, reference });
      if (res.ok) { onDone(res.pending ? res.message : null); return; }
      setErr(t(res.error, res.params));
      if (res.code === "idempotency_key_reused") key.current = newKey();
    });
  }

  return (
    <Modal title={t(FORM_TITLE[kind])} onClose={onClose}>
      <form onSubmit={submit} data-testid={`wh-form-${kind}`}>
        <Err>{err}</Err>
        <div className="grid gap-4">
          <Field label={t("کد کالا (SKU)")} required>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} dir="ltr" readOnly={Boolean(item)} aria-label={t("کد کالا (SKU)")} required />
          </Field>
          <Field label={kind === "transfer" ? t("از انبار") : t("انبار")} required>
            <Select value={loc} onChange={(e) => setLoc(e.target.value)} aria-label={kind === "transfer" ? t("از انبار") : t("انبار")}>
              {active.map((l) => <option key={l.id} value={String(l.id)}>{l.code} — {l.name}</option>)}
            </Select>
          </Field>
          {kind === "transfer" && (
            <Field label={t("به انبار")} required>
              <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("به انبار")}>
                {active.map((l) => <option key={l.id} value={String(l.id)}>{l.code} — {l.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={kind === "adjust" ? t("مقدار (مثبت = افزایش، منفی = کاهش)") : t("مقدار")} required>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0" aria-label={t("مقدار")} required />
          </Field>
          {(kind === "adjust" || kind === "reserve") && (
            <Field label={kind === "adjust" ? t("دلیل") : t("توضیح")} required={kind === "adjust"}>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} aria-label={kind === "adjust" ? t("دلیل") : t("توضیح")} />
            </Field>
          )}
          {kind !== "adjust" && (
            <Field label={t("شمارهٔ سند / سفارش")}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} dir="ltr" aria-label={t("شمارهٔ سند / سفارش")} />
            </Field>
          )}
          {kind === "adjust" && approval && <p className="text-sm rounded-xl px-3 py-2.5 bg-primary/10 text-primary" data-testid="wh-approval-note">{t("این اصلاح پس از تأیید مسئول اعمال می‌شود.")}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button type="submit" disabled={pending} className="btn-primary size-md flex-1 disabled:opacity-60">
            {pending ? <Spinner /> : <Icon name="save" size={17} />}{pending ? t("در حال ثبت…") : approval ? t("ارسال برای تأیید") : t("ثبت")}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReverseModal({ movement, actions, onClose, onDone }) {
  const t = useT();
  const key = useRef(newKey());
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  function submit(e) {
    e.preventDefault();
    setErr("");
    start(async () => {
      const res = await actions.reverseMovement({ key: key.current, movementId: movement.id, reason });
      if (res.ok) onDone(null); else setErr(t(res.error, res.params));
    });
  }
  return (
    <Modal title={t("برگشت حرکت انبار")} onClose={onClose}>
      <form onSubmit={submit} data-testid="wh-form-reverse">
        <Err>{err}</Err>
        <p className="text-sm text-ink-soft mb-4 break-words"><span dir="ltr">{movement.sku}</span> · {t(KIND_LABEL[movement.kind])} · <span dir="ltr">{movement.delta > 0 ? "+" : ""}{fmt(movement.delta)}</span></p>
        <Field label={t("دلیل")} required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} aria-label={t("دلیل")} />
        </Field>
        <div className="flex gap-2 mt-5">
          <button type="submit" disabled={pending} className="btn-primary size-md flex-1 disabled:opacity-60 !bg-warn hover:!bg-warn/90">{pending ? <Spinner /> : <Icon name="refresh" size={17} />}{t("برگشت")}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </Modal>
  );
}

// the minimum quantity of one product (all warehouses together); empty removes it
function LevelModal({ item, actions, onClose, onDone }) {
  const t = useT();
  const [min, setMin] = useState(item.minLevel == null ? "" : String(item.minLevel));
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  function submit(e) {
    e.preventDefault();
    setErr("");
    start(async () => {
      const res = await actions.setMinLevel({ productId: item.productId, minLevel: min });
      if (res.ok) onDone(null); else setErr(t(res.error, res.params));
    });
  }
  return (
    <Modal title={t("حداقل موجودی کالا")} onClose={onClose}>
      <form onSubmit={submit} data-testid="wh-form-level">
        <Err>{err}</Err>
        <p className="text-sm text-ink-soft mb-4 break-words"><span dir="ltr">{item.sku}</span>{item.name && ` · ${item.name}`}</p>
        <Field label={t("حداقل موجودی")} hint={t("کمتر از این مقدار، کالا «کم‌موجودی» نشان داده می‌شود. خالی = بدون حداقل.")}>
          <Input value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" dir="ltr" placeholder="0" aria-label={t("حداقل موجودی")} />
        </Field>
        <div className="flex gap-2 mt-5">
          <button type="submit" disabled={pending} className="btn-primary size-md flex-1 disabled:opacity-60">{pending ? <Spinner /> : <Icon name="save" size={17} />}{t("ذخیره")}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </Modal>
  );
}

function LocationModal({ location, actions, onClose, onDone }) {
  const t = useT();
  const [f, setF] = useState({ code: location?.code || "", name: location?.name || "", note: location?.note || "", is_active: location ? location.is_active : true, sort_order: location?.sort_order ?? 0 });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const up = (k, v) => setF((s) => ({ ...s, [k]: v }));
  function submit(e) {
    e.preventDefault();
    setErr("");
    start(async () => {
      const res = location ? await actions.updateLocation(location.id, f, location.version) : await actions.createLocation(f);
      if (res.ok) onDone(null); else setErr(t(res.error, res.params));
    });
  }
  return (
    <Modal title={location ? t("ویرایش انبار") : t("ساخت انبار")} onClose={onClose}>
      <form onSubmit={submit} data-testid="wh-form-location">
        <Err>{err}</Err>
        <div className="grid gap-4">
          <Field label={t("کد انبار")} required hint={location ? t("کد انبار تغییر نمی‌کند.") : t("حروف لاتین بزرگ، عدد، - یا _")}>
            <Input value={f.code} onChange={(e) => up("code", e.target.value)} dir="ltr" readOnly={Boolean(location)} maxLength={20} aria-label={t("کد انبار")} required />
          </Field>
          <Field label={t("نام انبار")} required><Input value={f.name} onChange={(e) => up("name", e.target.value)} maxLength={80} aria-label={t("نام انبار")} required /></Field>
          <Field label={t("توضیح")}><Textarea value={f.note} onChange={(e) => up("note", e.target.value)} rows={2} maxLength={300} aria-label={t("توضیح")} /></Field>
          {location && (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={f.is_active} onChange={(e) => up("is_active", e.target.checked)} className="w-4 h-4 accent-brand-violet" />{t("انبار فعال است")}
            </label>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button type="submit" disabled={pending} className="btn-primary size-md flex-1 disabled:opacity-60">{pending ? <Spinner /> : <Icon name="save" size={17} />}{t("ذخیره")}</button>
          <button type="button" onClick={onClose} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function WarehousePanel({ data, actions, base }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const router = useRouter();
  const [modal, setModal] = useState(null);       // { type: "move", kind, item } | { type: "reverse", movement } | { type: "location", location } | { type: "level", item }
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const canOp = { receive: useCan("inventory.receive"), issue: useCan("inventory.issue"), transfer: useCan("inventory.transfer"), adjust: useCan("inventory.adjust"), reserve: useCan("inventory.reserve") };
  const canLocations = useCan("inventory.locations");
  const canLevel = useCan("inventory.level");
  const canExport = useCan("inventory.export");

  const locations = data?.locations;
  const locs = useMemo(() => locations || [], [locations]);
  const locById = useMemo(() => Object.fromEntries(locs.map((l) => [l.id, l])), [locs]);
  const code = (id) => locById[id]?.code || `#${id}`;

  if (!data?.ok) {
    return (
      <>
        <PageHeader title={t("انبار")} />
        <div role="alert" className="text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {t(data?.error || "انبار در دسترس نیست (مهاجرت ۳۶ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد).")}</div>
      </>
    );
  }

  const done = (message) => { setModal(null); setMsg({ text: message ? t(message) : t("انجام شد."), ok: true }); router.refresh(); };
  const open = (type, extra = {}) => setModal({ type, ...extra });
  const hasActive = locs.some((l) => l.is_active);

  function release(r) {
    start(async () => {
      const res = await actions.releaseReservation({ key: newKey(), reservationId: r.id });
      if (res.ok) done(null); else setMsg({ text: t(res.error, res.params), ok: false });
    });
  }

  const KINDS = ["receive", "issue", "transfer", "adjust"].filter((k) => canOp[k]);

  return (
    <>
      <PageHeader title={t("انبار")} subtitle={t("{length} انبار", { length: locs.length })}>
        {hasActive && KINDS.map((k) => (
          <button key={k} type="button" onClick={() => open("move", { kind: k })} data-testid={`wh-open-${k}`} className="btn-ghost size-md">{t(FORM_TITLE[k])}</button>
        ))}
      </PageHeader>

      {msg && <div role="status" className={`mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}><Icon name={msg.ok ? "check" : "alertTriangle"} size={16} /> <span className="min-w-0 break-words">{msg.text}</span></div>}

      <div role="tablist" className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((tb) => (
          <Link key={tb.id} role="tab" aria-selected={data.tab === tb.id} href={`${base}?tab=${tb.id}`} data-testid={`wh-tab-${tb.id}`}
            className={`btn-ghost size-sm ${data.tab === tb.id ? "!border-brand-violet/50 !text-brand-violet !bg-brand-violet/5" : ""}`}>{t(tb.label)}</Link>
        ))}
      </div>

      {(data.tab === "stock" || data.tab === "movements") && (
        <form action={base} method="get" className="card-flat p-3 mb-4 flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value={data.tab} />
          <Input name="q" defaultValue={data.q} placeholder={data.tab === "stock" ? t("جستجوی نام یا SKU…") : t("SKU دقیق…")} aria-label={t("جستجو")} className="flex-1 min-w-[160px]" />
          <Select name="location" defaultValue={data.locationId ? String(data.locationId) : ""} aria-label={t("انبار")} className="w-auto min-w-[140px]">
            <option value="">{t("همهٔ انبارها")}</option>
            {locs.map((l) => <option key={l.id} value={String(l.id)}>{l.code}</option>)}
          </Select>
          {data.tab === "stock" && (
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" name="low" value="1" defaultChecked={data.lowOnly} className="w-4 h-4 accent-brand-violet" data-testid="wh-low-only" />{t("فقط کم‌موجودی")}</label>
          )}
          <button type="submit" className="btn-primary size-md"><Icon name="search" size={16} /> {t("جستجو")}</button>
          {canExport && data.tab === "stock" && <CsvButton testId="wh-stock-csv" run={() => actions.exportStockCsv({ locationId: data.locationId })} />}
          {canExport && data.tab === "movements" && <CsvButton testId="wh-movements-csv" run={() => actions.exportMovementsCsv({})} />}
        </form>
      )}

      {data.tab === "stock" && (
        data.items.length === 0 ? (
          <EmptyState icon="package" title={t("هنوز موجودی ثبت نشده")} desc={locs.length ? t("با «ورود کالا به انبار» شروع کنید.") : t("ابتدا از تب «انبارها» یک انبار بسازید.")} />
        ) : (
          <div className="card divide-y divide-line overflow-hidden" data-testid="wh-stock">
            {data.items.map((it) => (
              <div key={it.productId} data-testid="wh-stock-row" className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 min-w-0">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="font-medium text-ink truncate"><span dir="ltr">{it.sku}</span> {it.name && <span className="text-ink-muted font-normal">· {it.name}</span>}</p>
                  <p className="text-xs text-ink-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {it.places.map((p) => <span key={p.locationId} dir="ltr">{code(p.locationId)}: {fmt(p.quantity)}{p.reserved ? ` (${fmt(p.reserved)} R)` : ""}</span>)}
                  </p>
                </div>
                <div className="text-sm tabular text-ink shrink-0 flex items-center gap-2" data-testid="wh-total">
                  {it.low && <Badge tone="warn" data-testid="wh-low">{t("کم‌موجودی")}</Badge>}
                  <span><b>{fmt(it.total)}</b> <span className="text-ink-faint text-xs">{t("موجود")}{it.reserved ? ` · ${fmt(it.reserved)} ${t("رزرو")}` : ""}{it.minLevel != null ? ` · ${t("حداقل")} ${fmt(it.minLevel)}` : ""}</span></span>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                  {KINDS.map((k) => <button key={k} type="button" className="btn-ghost size-sm" onClick={() => open("move", { kind: k, item: it })}>{t(KIND_LABEL[k])}</button>)}
                  {canOp.reserve && <button type="button" className="btn-ghost size-sm" onClick={() => open("move", { kind: "reserve", item: it })}>{t("رزرو")}</button>}
                  {canLevel && !data.levelsUnavailable && <button type="button" className="btn-ghost size-sm" onClick={() => open("level", { item: it })} data-testid="wh-level-open">{t("حداقل")}</button>}
                </div>
              </div>
            ))}
          </div>
        )
      )}
      {data.tab === "stock" && data.total > 0 && <TabPager data={data} base={base} tab="stock" total={data.total} pageCount={data.pageCount} />}

      {data.tab === "movements" && (
        data.noSuchProduct ? <EmptyState icon="search" title={t("این SKU پیدا نشد")} /> :
        data.movements.length === 0 ? <EmptyState icon="clock" title={t("هنوز حرکتی ثبت نشده")} /> : (
          <>
            <div className="card divide-y divide-line overflow-hidden" data-testid="wh-movements">
              {data.movements.map((m) => (
                <div key={m.id} data-testid="wh-movement" data-kind={m.kind} className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                  <Badge tone={KIND_TONE[m.kind] || "neutral"}>{t(KIND_LABEL[m.kind] || m.kind)}</Badge>
                  <div className="min-w-0 flex-1 basis-44">
                    <p className="text-sm text-ink truncate"><span dir="ltr">{m.sku}</span> · <span dir="ltr">{code(m.locationId)}</span></p>
                    <p className="text-xs text-ink-muted break-words">{[m.reason, m.reference, m.who].filter(Boolean).join(" · ")} · {fmtDate(m.at)}</p>
                  </div>
                  <div className="tabular text-sm shrink-0" dir="ltr"><b className={m.delta > 0 ? "text-ok" : "text-warn"}>{m.delta > 0 ? "+" : ""}{fmt(m.delta)}</b> <span className="text-ink-faint text-xs">→ {fmt(m.balanceAfter)}</span></div>
                  {m.canReverse && canOp.adjust && <button type="button" className="btn-ghost size-sm" onClick={() => open("reverse", { movement: m })}>{t("برگشت")}</button>}
                </div>
              ))}
            </div>
            <TabPager data={data} base={base} tab="movements" />
          </>
        )
      )}

      {data.tab === "reservations" && (
        data.reservations.length === 0 && data.page === 1 ? <EmptyState icon="clock" title={t("رزرو فعالی وجود ندارد")} /> : (
          <>
          <div className="card divide-y divide-line overflow-hidden" data-testid="wh-reservations">
            {data.reservations.map((r) => (
              <div key={r.id} data-testid="wh-reservation" className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                <div className="min-w-0 flex-1 basis-44">
                  <p className="text-sm text-ink truncate"><span dir="ltr">{r.sku}</span> · <span dir="ltr">{code(r.locationId)}</span> · <b className="tabular">{fmt(r.qty)}</b></p>
                  <p className="text-xs text-ink-muted break-words">{[r.reference, r.note, r.who].filter(Boolean).join(" · ")} · {fmtDate(r.at)}</p>
                </div>
                {canOp.reserve && <button type="button" disabled={pending} className="btn-ghost size-sm" onClick={() => release(r)}>{t("آزادسازی رزرو")}</button>}
              </div>
            ))}
          </div>
          <TabPager data={data} base={base} tab="reservations" />
          </>
        )
      )}

      {data.tab === "counts" && <CountsTab data={data} actions={actions} base={base} code={code} />}

      {data.tab === "locations" && (
        <>
          {canLocations && <div className="mb-3"><button type="button" className="btn-primary size-md" onClick={() => open("location", { location: null })} data-testid="wh-new-location"><Icon name="plus" size={17} /> {t("ساخت انبار")}</button></div>}
          {locs.length === 0 ? <EmptyState icon="layers" title={t("هنوز انباری ساخته نشده")} /> : (
            <div className="card divide-y divide-line overflow-hidden" data-testid="wh-locations">
              {locs.map((l) => (
                <div key={l.id} data-testid="wh-location" className="px-3 sm:px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                  <div className="min-w-0 flex-1 basis-44">
                    <p className="font-medium text-ink truncate"><span dir="ltr">{l.code}</span> · {l.name}</p>
                    {l.note && <p className="text-xs text-ink-muted break-words">{l.note}</p>}
                  </div>
                  <Badge tone={l.is_active ? "ok" : "muted"}>{l.is_active ? t("فعال") : t("غیرفعال")}</Badge>
                  {canLocations && <button type="button" className="btn-ghost size-sm" onClick={() => open("location", { location: l })}>{t("ویرایش")}</button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {modal?.type === "move" && <MovementModal kind={modal.kind} item={modal.item} locations={locs} actions={actions} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "reverse" && <ReverseModal movement={modal.movement} actions={actions} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "level" && <LevelModal item={modal.item} actions={actions} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === "location" && <LocationModal location={modal.location} actions={actions} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}

