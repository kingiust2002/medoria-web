"use client";
// components/operator/ImportWizard.jsx — Excel/CSV product import.
// Flow: template → upload → parse → SERVER dry-run (authoritative preview) →
// confirm → chunked commit (server re-validates every chunk) → final report
// (+ downloadable CSV). A real .xlsx/.xls is parsed on the SERVER (SheetJS,
// server-only — never shipped to the browser, so the public bundle stays
// light); .csv is parsed in the browser (no library needed). Uploaded files
// are read in memory and never stored.
import { codesText } from "@/lib/operator/publishRules";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { parseCsvWithHeader, toCsv } from "@/lib/operator/csv";
import {
  IMPORT_COLUMNS, IMPORT_COLUMN_KEYS, MAX_ROWS_PER_FILE,
  normalizeRow, findInFileDuplicates,
} from "@/lib/operator/importCore";
import { dryRunProductRows, commitProductRows, finalizeProductBatch, submitImportForApproval, exportProductsCsv, parseSpreadsheet, downloadTemplateXlsx } from "@/lib/operator/importActions";

const UPLOAD_ACCEPT = ".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";
import { PageHeader, SectionCard, Badge, Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import { useMode } from "@/components/panel/Capabilities";
import { tr } from "@/lib/panel/i18n";

// a row the publish rule stopped is saved (or would be) as an inactive draft; say why, in the person's language
const draftNote = (r, t) => (r.publishUnavailable ? [t("قوانین کیفیت انتشار خوانده نشد؛ به‌صورت پیش‌نویس غیرفعال ذخیره شد.")]
  : r.publishBlocked?.length ? [t("به‌صورت پیش‌نویس غیرفعال ذخیره می‌شود؛ ناقص: {items}", { items: codesText(r.publishBlocked, t) })] : []);

const DRY_CHUNK = 100;
const COMMIT_CHUNK = 25;

const STATUS_FA = { create: tr("ساخت"), update: tr("بروزرسانی"), skip: tr("رد"), error: tr("خطا") };
const STATUS_TONE = { create: "ok", update: "violet", skip: "neutral", error: "warn" };
const MODES = [
  { value: "add", label: tr("فقط افزودن"), desc: tr("SKU/اسلاگ موجود → رد می‌شود") },
  { value: "upsert", label: tr("افزودن + بروزرسانی"), desc: tr("موجود → بروزرسانی، جدید → ساخت") },
  { value: "update", label: tr("فقط بروزرسانی"), desc: tr("فقط محصول‌های موجود؛ جدید رد می‌شود") },
];

function downloadText(name, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadBase64(name, b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([arr], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ImportWizard({ recentLogs = [] }) {
  const t = useT();
  const router = useRouter();
  const importMode = useMode("products.import");        // "approval": the file is read and checked as usual, but the write is ONE request for a reviewer
  const [filed, setFiled] = useState(null);                // the answer of the server when the file was sent for approval
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);     // { name, rows, unknownHeaders, truncated }
  const [mode, setMode] = useState("add");
  const [autoCreate, setAutoCreate] = useState(false);
  const [strict, setStrict] = useState(false);
  const [busy, setBusy] = useState("");        // "" | "dry" | "commit"
  const [progress, setProgress] = useState(null);
  const [dry, setDry] = useState(null);        // { results, counts, createdCategories }
  const [final, setFinal] = useState(null);    // same shape, after commit
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [tplBusy, setTplBusy] = useState(false);
  const [autoTranslate, setAutoTranslate] = useState(true);

  // ── template + export ───────────────────────────────────────────────────────
  // Styled .xlsx template (colour-coded, sized, with dropdowns) — built server-side.
  async function downloadTemplate() {
    setTplBusy(true);
    const res = await downloadTemplateXlsx();
    setTplBusy(false);
    if (res?.ok) downloadBase64(res.filename || "medoria-products-template.xlsx", res.base64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    else setErr(t(res?.error) || t("ساخت قالب ناموفق بود."));
  }
  async function doExport() {
    setExporting(true);
    const res = await exportProductsCsv();
    setExporting(false);
    if (res?.ok) downloadText(`medoria-products-${new Date().toISOString().slice(0, 10)}.csv`, res.csv);
    else setErr(t(res?.error) || t("خروجی گرفتن ناموفق بود."));
  }

  // ── file pick + parse ───────────────────────────────────────────────────────
  // Shared: turn { headers, rows } (from either the browser CSV reader or the
  // server-side Excel parser) into the wizard's file state.
  function applyRows(name, headers, rows, truncated) {
    if (!rows.length) { setErr(t("هیچ ردیف داده‌ای در فایل پیدا نشد (سطر اول باید عنوان ستون‌ها باشد).")); return; }
    const unknownHeaders = headers.filter((h) => h && !IMPORT_COLUMN_KEYS.includes(h));
    setFile({ name, rows: rows.slice(0, MAX_ROWS_PER_FILE), unknownHeaders, truncated: !!truncated });
  }

  async function onFile(e) {
    setErr("");
    setDry(null);
    setFinal(null);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;

    // Real Excel workbook → parse on the server (SheetJS never ships to the browser).
    if (/\.xlsx?$/i.test(f.name)) {
      setParsing(true);
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await parseSpreadsheet(fd);
        if (!res?.ok) { setErr(t(res?.error) || t("خواندن فایل اکسل ناموفق بود.")); return; }
        applyRows(f.name, res.headers, res.rows, res.truncated);
      } catch {
        setErr(t("خواندن فایل اکسل ناموفق بود."));
      } finally {
        setParsing(false);
      }
      return;
    }

    // CSV → parse in the browser (no library, keeps things light).
    let text;
    try { text = await f.text(); } catch { setErr(t("خواندن فایل ناموفق بود.")); return; }
    const { headers, rows } = parseCsvWithHeader(text);
    applyRows(f.name, headers, rows, rows.length > MAX_ROWS_PER_FILE);
  }

  // rows that are in-file SKU duplicates (client-detected, excluded everywhere)
  const dupRows = useMemo(() => {
    if (!file) return new Set();
    return findInFileDuplicates(file.rows.map((r, i) => normalizeRow(r, i + 1)));
  }, [file]);

  // ── dry run ─────────────────────────────────────────────────────────────────
  async function runDry() {
    if (!file) return;
    setBusy("dry");
    setErr("");
    setFinal(null);
    setFilter("all");
    const sendable = file.rows.map((raw, i) => ({ raw, rowNum: i + 1 })).filter((x) => !dupRows.has(x.rowNum));
    const merged = [];
    const createdCats = new Set();
    try {
      for (let i = 0; i < sendable.length; i += DRY_CHUNK) {
        const chunk = sendable.slice(i, i + DRY_CHUNK);
        const res = await dryRunProductRows(chunk.map((x) => x.raw), { mode, autoCreateCategories: autoCreate, startRow: 1 });
        if (!res?.ok) { setErr(t(res?.error) || t("بررسی فایل ناموفق بود.")); setBusy(""); return; }
        for (const out of res.results) {
          const meta = chunk[out.rowNum - 1];
          if (meta) merged.push({ ...out, rowNum: meta.rowNum });
        }
        for (const c of res.createdCategories || []) createdCats.add(c);
        setProgress({ done: Math.min(i + chunk.length, sendable.length), total: sendable.length });
      }
    } catch {
      setErr(t("ارتباط با سرور برقرار نشد."));
      setBusy("");
      setProgress(null);
      return;
    }
    for (const rowNum of dupRows) {
      merged.push({ rowNum, status: "error", messages: [t("SKU در همین فایل تکراری است — فقط اولین ردیف پردازش می‌شود.")], warnings: [] });
    }
    merged.sort((a, b) => a.rowNum - b.rowNum);
    setDry({ results: merged, counts: countResults(merged), createdCategories: [...createdCats] });
    setBusy("");
    setProgress(null);
  }

  // ── commit ──────────────────────────────────────────────────────────────────
  async function runCommit() {
    if (!file || !dry) return;
    if (strict && dry.counts.error > 0) return;
    if (importMode === "approval") {
      if (!window.confirm(t("این فایل ({create} ساخت، {update} بروزرسانی) به‌صورت یک درخواست برای تأیید ارسال شود؟ تا تأیید نشود چیزی در کاتالوگ تغییر نمی‌کند.", { create: dry.counts.create, update: dry.counts.update }))) return;
      setBusy("commit"); setErr("");
      const rows = file.rows.map((raw, i) => ({ raw, rowNum: i + 1 })).filter((x) => !dupRows.has(x.rowNum)).map((x) => x.raw);
      let res = null;
      try { res = await submitImportForApproval(rows, { mode, autoCreateCategories: autoCreate, autoTranslate, strict }, { fileName: file.name }); } catch { res = null; }
      setBusy("");
      if (res?.ok) setFiled({ message: res.message, duplicate: Boolean(res.duplicate) }); else setErr(t(res?.error) || t("ارتباط با سرور برقرار نشد."));
      return;
    }
    if (!window.confirm(t("ورود {create} ساخت و {update} بروزرسانی انجام شود؟", { create: dry.counts.create, update: dry.counts.update }))) return;
    setBusy("commit");
    setErr("");
    const sendable = file.rows.map((raw, i) => ({ raw, rowNum: i + 1 })).filter((x) => !dupRows.has(x.rowNum));
    const merged = [];
    const createdCats = new Set();
    let connectionError = "";
    for (let i = 0; i < sendable.length; i += COMMIT_CHUNK) {
      const chunk = sendable.slice(i, i + COMMIT_CHUNK);
      let res;
      try {
        res = await commitProductRows(chunk.map((x) => x.raw), { mode, autoCreateCategories: autoCreate, autoTranslate, strict, startRow: 1 });
      } catch { res = null; }
      if (!res?.ok) { connectionError = t(res?.error) || t("ارتباط قطع شد — ردیف‌های باقی‌مانده وارد نشدند."); break; }
      if (res.aborted) { connectionError = t(res.error) || t("حالت سخت‌گیرانه: این بخش به‌خاطر خطا ذخیره نشد."); }
      for (const out of res.results) {
        const meta = chunk[out.rowNum - 1];
        if (meta) merged.push({ ...out, rowNum: meta.rowNum });
      }
      for (const c of res.createdCategories || []) createdCats.add(c);
      setProgress({ done: Math.min(i + chunk.length, sendable.length), total: sendable.length });
    }
    for (const rowNum of dupRows) {
      merged.push({ rowNum, status: "error", messages: [t("SKU در همین فایل تکراری بود — وارد نشد.")], warnings: [] });
    }
    merged.sort((a, b) => a.rowNum - b.rowNum);
    const counts = countResults(merged);
    try {
      await finalizeProductBatch({
        source: "csv", fileName: file.name, mode,
        total: counts.total, create: counts.create, update: counts.update,
        skip: counts.skip, error: counts.error, categoriesCreated: createdCats.size,
        summary: connectionError || null,
      });
    } catch { /* best-effort */ }
    setFinal({ results: merged, counts, createdCategories: [...createdCats], connectionError });
    setBusy("");
    setProgress(null);
    setFilter("all");
    router.refresh();
  }

  function downloadReport() {
    const data = (final || dry)?.results || [];
    const rows = data.map((r) => ({
      row: r.rowNum,
      status: r.status,
      slug: r.slug || "",
      messages: [...(r.messages || []), ...(r.warnings || [])].join(" | "),
    }));
    downloadText("medoria-import-report.csv", toCsv(["row", "status", "slug", "messages"], rows));
  }

  function reset() {
    setFile(null); setDry(null); setFinal(null); setFiled(null); setErr(""); setFilter("all");
  }

  const view = final || dry;
  const filtered = useMemo(() => {
    if (!view) return [];
    if (filter === "all") return view.results;
    if (filter === "warning") return view.results.filter((r) => r.warnings?.length);
    if (filter === "draft") return view.results.filter((r) => r.publishBlocked?.length || r.publishUnavailable);
    return view.results.filter((r) => r.status === filter);
  }, [view, filter]);

  const nameOf = (rowNum) => {
    const raw = file?.rows?.[rowNum - 1];
    return raw ? (raw.name_fa || raw.name_en || raw.sku || "—") : "—";
  };

  return (
    <>
      <PageHeader title={t("ورود از Excel/CSV")} subtitle={t("فایل را آپلود کنید، پیش‌نمایش را بررسی کنید، بعد تأیید کنید — قبل از تأیید چیزی ذخیره نمی‌شود.")}>
        <Link href="/operator/products" className="btn-ghost size-md"><Icon name="chevronRight" size={16} className="ltr:-scale-x-100" /> {t("محصولات")}</Link>
        <Link href="/operator/products/bulk" className="btn-ghost size-md"><Icon name="plusCircle" size={16} /> {t("افزودن گروهی دستی")}</Link>
      </PageHeader>

      {err && (
        <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn">
          <Icon name="alertTriangle" size={16} /> {err}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          {/* Step 1 — file */}
          <SectionCard title={t("۱) فایل")} desc={t("قالب را دانلود کنید، در Excel پر کنید و همین‌جا آپلود کنید — فایل Excel (‎.xlsx‎) یا CSV، هر دو مستقیم پشتیبانی می‌شوند")} icon="upload">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadTemplate} disabled={tplBusy} className="btn-ghost size-md disabled:opacity-60">{tplBusy ? <Spinner /> : <Icon name="download" size={16} />} {t("دانلود قالب Excel")}</button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={parsing} className="btn-primary size-md disabled:opacity-60">
                {parsing ? <Spinner /> : <Icon name="upload" size={16} />} {parsing ? t("در حال خواندن…") : t("آپلود فایل Excel یا CSV")}
              </button>
              <button type="button" onClick={doExport} disabled={exporting} className="btn-ghost size-md disabled:opacity-60">
                {exporting ? <Spinner /> : <Icon name="download" size={16} />} {t("خروجی محصولات فعلی")}</button>
              <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={onFile} />
            </div>
            {file && (
              <div className="mt-4 text-sm rounded-xl px-3 py-2.5 bg-canvas-soft border border-line flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-ink truncate" dir="ltr">{file.name}</span>
                <span className="text-ink-muted">{t("{length} ردیف", { length: file.rows.length })}</span>
                {dupRows.size > 0 && <Badge tone="warn">{t("{size} ردیف SKU تکراری در فایل", { size: dupRows.size })}</Badge>}
                {file.truncated && <Badge tone="warn">{t("بیش از {MAX_ROWS_PER_FILE} ردیف — فقط {MAX_ROWS_PER_FILE2} ردیف اول", { MAX_ROWS_PER_FILE, MAX_ROWS_PER_FILE2: MAX_ROWS_PER_FILE })}</Badge>}
                {file.unknownHeaders.length > 0 && <Badge tone="info">{t("ستون‌های ناشناخته نادیده گرفته شد:")} {file.unknownHeaders.join(t("، "))}</Badge>}
                <button type="button" onClick={reset} className="ms-auto text-ink-muted hover:text-warn" title={t("حذف فایل")}><Icon name="close" size={15} /></button>
              </div>
            )}
            <details className="mt-4 group">
              <summary className="cursor-pointer text-xs font-semibold text-brand-violet inline-flex items-center gap-1">{t("راهنمای ستون‌ها")} <Icon name="chevronDown" size={14} className="group-open:rotate-180 transition-transform" /></summary>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" dir="rtl">
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block bg-warn" /> {t("اجباری")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block bg-ok" /> {t("خودکار (خالی بگذاری، خودش پر می‌کند)")}</span>
                <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block bg-brand-violet" /> {t("اختیاری")}</span>
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] text-ink-soft" dir="rtl">
                {IMPORT_COLUMNS.map((c) => (
                  <div key={c.key} className="flex gap-2 items-baseline">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 translate-y-1 ${c.tier === "required" ? "bg-warn" : c.tier === "auto" ? "bg-ok" : "bg-brand-violet"}`} />
                    <code className="text-brand-violet shrink-0" dir="ltr">{c.key}</code><span className="text-ink-muted">{t(c.label)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">{t("قیمت خالی = استعلام قیمت · بولین‌ها: yes/no یا بله/خیر یا 1/0 · جداکنندهٔ لیست‌ها: | · در حالت بروزرسانی، سلول خالی یعنی «بدون تغییر».")}</p>
            </details>
          </SectionCard>

          {/* Step 2 — options + dry run */}
          {file && (
            <SectionCard title={t("۲) تنظیمات و بررسی")} desc={t("اول بررسی (dry-run) — هیچ‌چیز ذخیره نمی‌شود")} icon="search">
              <div className="grid sm:grid-cols-3 gap-2.5">
                {MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => { setMode(m.value); setDry(null); setFinal(null); }}
                    className={`text-start rounded-xl border p-3 transition-colors ${mode === m.value ? "border-brand-violet bg-brand-violet/5" : "border-line hover:border-brand-violet/40"}`}>
                    <span className="block text-[13px] font-semibold text-ink">{t(m.label)}</span>
                    <span className="block text-[11px] text-ink-muted mt-1 leading-relaxed">{t(m.desc)}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[13px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-brand-violet w-4 h-4" checked={autoCreate} onChange={(e) => { setAutoCreate(e.target.checked); setDry(null); setFinal(null); }} />
                  <span>{t("دسته‌های ناموجود به‌صورت خودکار ساخته شوند")} <span className="text-ink-faint">{t("(در گزارش اعلام می‌شود)")}</span></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-brand-violet w-4 h-4" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
                  <span>{t("حالت سخت‌گیرانه")} <span className="text-ink-faint">{t("(با وجود هر خطا، هیچ ردیفی وارد نشود)")}</span></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-brand-violet w-4 h-4" checked={autoTranslate} onChange={(e) => setAutoTranslate(e.target.checked)} />
                  <span>{t("ترجمهٔ خودکار زبان‌های خالی")} <span className="text-ink-faint">{t("(نام و توضیحات محصولات تازه — از زبانی که پر کرده‌ای)")}</span></span>
                </label>
              </div>
              <div className="flex items-center gap-3 mt-5">
                <button type="button" onClick={runDry} disabled={busy !== ""} className="btn-primary size-md disabled:opacity-60">
                  {busy === "dry" ? <Spinner /> : <Icon name="search" size={17} />}
                  {busy === "dry" ? t("در حال بررسی…") : t("بررسی فایل (بدون ذخیره)")}
                </button>
                {busy && progress && <span className="text-xs text-ink-muted tabular">{progress.done}/{progress.total}</span>}
              </div>
            </SectionCard>
          )}

          {/* Step 3 — preview / report */}
          {view && (
            <SectionCard
              title={final ? t("۴) گزارش نهایی") : t("۳) پیش‌نمایش")}
              desc={final ? t("نتیجهٔ واقعی ورود") : t("این فقط پیش‌بینی است — هنوز چیزی ذخیره نشده")}
              icon={final ? "badgeCheck" : "eye"}
            >
              {final?.connectionError && (
                <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn">
                  <Icon name="alertTriangle" size={16} /> {final.connectionError}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[
                  ["all", t("همه {total}", { total: view.counts.total })],
                  ["create", t("ساخت {create}", { create: view.counts.create })],
                  ["update", t("بروزرسانی {update}", { update: view.counts.update })],
                  ["skip", t("رد {skip}", { skip: view.counts.skip })],
                  ["error", t("خطا {error}", { error: view.counts.error })],
                  ["warning", t("هشدار {warnings}", { warnings: view.counts.warnings })],
                  ["draft", t("پیش‌نویس (ناقص) {drafts}", { drafts: view.results.filter((r) => r.publishBlocked?.length || r.publishUnavailable).length })],
                ].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFilter(key)}
                    className={`pill !text-[11px] font-semibold transition-colors ${filter === key ? "bg-brand-violet text-white" : "bg-line-soft text-ink-muted hover:text-ink"}`}>
                    {label}
                  </button>
                ))}
                {view.createdCategories.length > 0 && (
                  <Badge tone="violet">{t("دسته‌های جدید:")} {view.createdCategories.join(t("، "))}</Badge>
                )}
              </div>

              <div className="max-h-[26rem] overflow-auto rounded-xl border border-line">
                <table className="w-full text-[12px]" dir="rtl">
                  <thead className="sticky top-0 bg-canvas-soft">
                    <tr className="text-ink-muted border-b border-line">
                      <th className="px-2.5 py-2 font-medium text-start w-14">{t("ردیف")}</th>
                      <th className="px-2.5 py-2 font-medium text-start">{t("محصول")}</th>
                      <th className="px-2.5 py-2 font-medium text-start w-24">{t("وضعیت")}</th>
                      <th className="px-2.5 py-2 font-medium text-start">{t("پیام‌ها")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((r) => (
                      <tr key={r.rowNum} className={r.status === "error" ? "bg-warn/5" : ""}>
                        <td className="px-2.5 py-2 text-ink-faint tabular">{r.rowNum}</td>
                        <td className="px-2.5 py-2 text-ink max-w-[220px] truncate">{nameOf(r.rowNum)}</td>
                        <td className="px-2.5 py-2"><Badge tone={STATUS_TONE[r.status]}>{STATUS_FA[r.status] ? t(STATUS_FA[r.status]) : r.status}</Badge></td>
                        <td className="px-2.5 py-2 text-ink-muted leading-relaxed">
                          {[...(r.messages || []), ...(r.warnings || []), ...draftNote(r, t)].join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-faint text-sm">{t("ردیفی با این فیلتر نیست.")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                {!final && !filed && (
                  <button
                    type="button"
                    onClick={runCommit}
                    disabled={busy !== "" || (strict && view.counts.error > 0) || (view.counts.create + view.counts.update === 0)}
                    className="btn-primary size-md disabled:opacity-60"
                  >
                    {busy === "commit" ? <Spinner /> : <Icon name="save" size={17} />}
                    {busy === "commit" ? (importMode === "approval" ? t("در حال ارسال…") : t("در حال ورود…")) : importMode === "approval" ? t("ارسال برای تأیید ({create} ساخت، {update} بروزرسانی)", { create: view.counts.create, update: view.counts.update }) : t("تأیید و ورود ({create} ساخت، {update} بروزرسانی)", { create: view.counts.create, update: view.counts.update })}
                  </button>
                )}
                {filed && <div role="status" data-testid="import-filed" className="basis-full text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-ok/10 text-ok"><Icon name="check" size={16} /> <span className="min-w-0 break-words">{t(filed.message)}</span></div>}
                {filed && <button type="button" onClick={reset} className="btn-ghost size-md"><Icon name="refresh" size={16} /> {t("فایل جدید")}</button>}
                {importMode === "approval" && !final && !filed && <Badge tone="warn">{t("ورود این فایل نیازمند تأیید است")}</Badge>}
                {busy === "commit" && progress && <span className="text-xs text-ink-muted tabular">{progress.done}/{progress.total}</span>}
                {strict && !final && view.counts.error > 0 && <Badge tone="warn">{t("حالت سخت‌گیرانه: اول خطاها را رفع کنید")}</Badge>}
                <button type="button" onClick={downloadReport} className="btn-ghost size-md"><Icon name="download" size={16} /> {t("دانلود گزارش CSV")}</button>
                {final && <button type="button" onClick={reset} className="btn-ghost size-md"><Icon name="refresh" size={16} /> {t("فایل جدید")}</button>}
              </div>
            </SectionCard>
          )}
        </div>

        {/* side: history */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <SectionCard title={t("سابقهٔ ورودها")} icon="clock" desc={recentLogs.length ? "" : t("بعد از اولین ورود (و اجرای مایگریشن ۰۸) اینجا پر می‌شود")}>
            {recentLogs.length ? (
              <div className="flex flex-col divide-y divide-line text-[12px]">
                {recentLogs.map((l) => (
                  <div key={l.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Icon name={l.source === "bulk" ? "plusCircle" : "upload"} size={14} className="text-brand-violet shrink-0" />
                      <span className="font-medium text-ink truncate" dir="ltr">{l.file_name || (l.source === "bulk" ? t("افزودن گروهی") : "—")}</span>
                    </div>
                    <p className="text-ink-muted mt-1">{t("{toLocaleString} · {total_rows} ردیف · {created_count} ساخت · {updated_count} بروزرسانی", { toLocaleString: new Date(l.created_at).toLocaleString("fa-IR"), total_rows: l.total_rows, created_count: l.created_count, updated_count: l.updated_count })}{l.error_count ? t(" · {error_count} خطا", { error_count: l.error_count }) : ""}{l.categories_created ? t(" · {categories_created} دسته جدید", { categories_created: l.categories_created }) : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">{t("هنوز سابقه‌ای ثبت نشده.")}</p>
            )}
          </SectionCard>
          <SectionCard title={t("نکته‌ها")} icon="shield">
            <ul className="text-[12px] text-ink-soft space-y-2 leading-relaxed list-disc ps-4">
              <li>{t("کلید تطبیق: اول SKU (بدون حساسیت به بزرگی حروف)، بعد اسلاگ.")}</li>
              <li>{t("در حالت بروزرسانی، سلول خالی یعنی «بدون تغییر» — داده‌ای پاک نمی‌شود.")}</li>
              <li>{t("تصویر: آدرس اینترنتی یا مسیر Storage موجود. آپلود فایل تصویر از صفحهٔ خود محصول.")}</li>
              <li>{t("حداکثر {MAX_ROWS_PER_FILE} ردیف در هر فایل (برای پایداری سرور).", { MAX_ROWS_PER_FILE })}</li>
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function countResults(results) {
  const s = { total: results.length, create: 0, update: 0, skip: 0, error: 0, warnings: 0 };
  for (const r of results) {
    s[r.status] = (s[r.status] || 0) + 1;
    if (r.warnings?.length) s.warnings += 1;
  }
  return s;
}
