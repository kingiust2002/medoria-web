"use client";
// components/beauty/operator/ImportWizard.jsx — Excel/CSV product import.
// Flow: template → upload → client parse → SERVER dry-run (authoritative
// preview) → confirm → chunked commit (server re-validates every chunk) →
// final report (+ downloadable CSV). XLSX is deliberately not parsed in v1 —
// operators save as "CSV UTF-8" from Excel; this avoids a ~1MB client dep.
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { parseCsvWithHeader, toCsv } from "@/lib/operator/csv";
import {
  IMPORT_COLUMNS, IMPORT_COLUMN_KEYS, MAX_ROWS_PER_FILE,
  normalizeRow, findInFileDuplicates,
} from "@/lib/operator/importCore";
import { dryRunProductRows, commitProductRows, finalizeProductBatch, exportProductsCsv } from "@/lib/beauty/operator/importActions";
import { PageHeader, SectionCard, Badge, Spinner } from "@/components/operator/ui";

const DRY_CHUNK = 100;
const COMMIT_CHUNK = 25;

const STATUS_FA = { create: "ساخت", update: "بروزرسانی", skip: "رد", error: "خطا" };
const STATUS_TONE = { create: "ok", update: "violet", skip: "neutral", error: "warn" };
const MODES = [
  { value: "add", label: "فقط افزودن", desc: "SKU/اسلاگ موجود → رد می‌شود" },
  { value: "upsert", label: "افزودن + بروزرسانی", desc: "موجود → بروزرسانی، جدید → ساخت" },
  { value: "update", label: "فقط بروزرسانی", desc: "فقط محصول‌های موجود؛ جدید رد می‌شود" },
];

function downloadText(name, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function ImportWizard({ recentLogs = [] }) {
  const router = useRouter();
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

  // ── template + export ───────────────────────────────────────────────────────
  function downloadTemplate() {
    const headers = IMPORT_COLUMN_KEYS;
    const example = IMPORT_COLUMNS.map((c) => c.example || "");
    downloadText("medoria-products-template.csv", toCsv(headers, [example]));
  }
  async function doExport() {
    setExporting(true);
    const res = await exportProductsCsv();
    setExporting(false);
    if (res?.ok) downloadText(`medoria-products-${new Date().toISOString().slice(0, 10)}.csv`, res.csv);
    else setErr(res?.error || "خروجی گرفتن ناموفق بود.");
  }

  // ── file pick + parse ───────────────────────────────────────────────────────
  async function onFile(e) {
    setErr("");
    setDry(null);
    setFinal(null);
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) {
      setErr("فایل Excel را اول با «Save As → CSV UTF-8» ذخیره کنید و همان CSV را آپلود کنید (پشتیبانی مستقیم XLSX در این نسخه نیست).");
      return;
    }
    let text;
    try { text = await f.text(); } catch { setErr("خواندن فایل ناموفق بود."); return; }
    const { headers, rows } = parseCsvWithHeader(text);
    if (!rows.length) { setErr("هیچ ردیف داده‌ای در فایل پیدا نشد (سطر اول باید عنوان ستون‌ها باشد)."); return; }
    const unknownHeaders = headers.filter((h) => h && !IMPORT_COLUMN_KEYS.includes(h));
    const truncated = rows.length > MAX_ROWS_PER_FILE;
    setFile({
      name: f.name,
      rows: rows.slice(0, MAX_ROWS_PER_FILE),
      unknownHeaders,
      truncated,
    });
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
        if (!res?.ok) { setErr(res?.error || "بررسی فایل ناموفق بود."); setBusy(""); return; }
        for (const out of res.results) {
          const meta = chunk[out.rowNum - 1];
          if (meta) merged.push({ ...out, rowNum: meta.rowNum });
        }
        for (const c of res.createdCategories || []) createdCats.add(c);
        setProgress({ done: Math.min(i + chunk.length, sendable.length), total: sendable.length });
      }
    } catch {
      setErr("ارتباط با سرور برقرار نشد.");
      setBusy("");
      setProgress(null);
      return;
    }
    for (const rowNum of dupRows) {
      merged.push({ rowNum, status: "error", messages: ["SKU در همین فایل تکراری است — فقط اولین ردیف پردازش می‌شود."], warnings: [] });
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
    if (!window.confirm(`ورود ${dry.counts.create} ساخت و ${dry.counts.update} بروزرسانی انجام شود؟`)) return;
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
        res = await commitProductRows(chunk.map((x) => x.raw), { mode, autoCreateCategories: autoCreate, strict, startRow: 1 });
      } catch { res = null; }
      if (!res?.ok) { connectionError = res?.error || "ارتباط قطع شد — ردیف‌های باقی‌مانده وارد نشدند."; break; }
      if (res.aborted) { connectionError = res.error || "حالت سخت‌گیرانه: این بخش به‌خاطر خطا ذخیره نشد."; }
      for (const out of res.results) {
        const meta = chunk[out.rowNum - 1];
        if (meta) merged.push({ ...out, rowNum: meta.rowNum });
      }
      for (const c of res.createdCategories || []) createdCats.add(c);
      setProgress({ done: Math.min(i + chunk.length, sendable.length), total: sendable.length });
    }
    for (const rowNum of dupRows) {
      merged.push({ rowNum, status: "error", messages: ["SKU در همین فایل تکراری بود — وارد نشد."], warnings: [] });
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
    setFile(null); setDry(null); setFinal(null); setErr(""); setFilter("all");
  }

  const view = final || dry;
  const filtered = useMemo(() => {
    if (!view) return [];
    if (filter === "all") return view.results;
    if (filter === "warning") return view.results.filter((r) => r.warnings?.length);
    return view.results.filter((r) => r.status === filter);
  }, [view, filter]);

  const nameOf = (rowNum) => {
    const raw = file?.rows?.[rowNum - 1];
    return raw ? (raw.name_fa || raw.name_en || raw.sku || "—") : "—";
  };

  return (
    <>
      <PageHeader title="ورود از Excel/CSV" subtitle="فایل را آپلود کنید، پیش‌نمایش را بررسی کنید، بعد تأیید کنید — قبل از تأیید چیزی ذخیره نمی‌شود.">
        <Link href="/beauty/operator/products" className="btn-ghost size-md"><Icon name="chevronRight" size={16} /> محصولات</Link>
        <Link href="/beauty/operator/products/bulk" className="btn-ghost size-md"><Icon name="plusCircle" size={16} /> افزودن گروهی دستی</Link>
      </PageHeader>

      {err && (
        <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn">
          <Icon name="alertTriangle" size={16} /> {err}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          {/* Step 1 — file */}
          <SectionCard title="۱) فایل" desc="قالب را دانلود کنید، در Excel پر کنید، با «CSV UTF-8» ذخیره و همین‌جا آپلود کنید" icon="upload">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadTemplate} className="btn-ghost size-md"><Icon name="download" size={16} /> دانلود قالب CSV</button>
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary size-md"><Icon name="upload" size={16} /> آپلود فایل CSV</button>
              <button type="button" onClick={doExport} disabled={exporting} className="btn-ghost size-md disabled:opacity-60">
                {exporting ? <Spinner /> : <Icon name="download" size={16} />} خروجی محصولات فعلی
              </button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </div>
            {file && (
              <div className="mt-4 text-sm rounded-xl px-3 py-2.5 bg-canvas-soft border border-line flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium text-ink truncate" dir="ltr">{file.name}</span>
                <span className="text-ink-muted">{file.rows.length} ردیف</span>
                {dupRows.size > 0 && <Badge tone="warn">{dupRows.size} ردیف SKU تکراری در فایل</Badge>}
                {file.truncated && <Badge tone="warn">بیش از {MAX_ROWS_PER_FILE} ردیف — فقط {MAX_ROWS_PER_FILE} ردیف اول</Badge>}
                {file.unknownHeaders.length > 0 && <Badge tone="info">ستون‌های ناشناخته نادیده گرفته شد: {file.unknownHeaders.join("، ")}</Badge>}
                <button type="button" onClick={reset} className="mr-auto text-ink-muted hover:text-warn" title="حذف فایل"><Icon name="close" size={15} /></button>
              </div>
            )}
            <details className="mt-4 group">
              <summary className="cursor-pointer text-xs font-semibold text-brand-violet inline-flex items-center gap-1">راهنمای ستون‌ها <Icon name="chevronDown" size={14} className="group-open:rotate-180 transition-transform" /></summary>
              <div className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] text-ink-soft" dir="rtl">
                {IMPORT_COLUMNS.map((c) => (
                  <div key={c.key} className="flex gap-2"><code className="text-brand-violet shrink-0" dir="ltr">{c.key}</code><span className="text-ink-muted">{c.label}</span></div>
                ))}
              </div>
              <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">قیمت خالی = استعلام قیمت · بولین‌ها: yes/no یا بله/خیر یا 1/0 · جداکنندهٔ لیست‌ها: | · در حالت بروزرسانی، سلول خالی یعنی «بدون تغییر».</p>
            </details>
          </SectionCard>

          {/* Step 2 — options + dry run */}
          {file && (
            <SectionCard title="۲) تنظیمات و بررسی" desc="اول بررسی (dry-run) — هیچ‌چیز ذخیره نمی‌شود" icon="search">
              <div className="grid sm:grid-cols-3 gap-2.5">
                {MODES.map((m) => (
                  <button key={m.value} type="button" onClick={() => { setMode(m.value); setDry(null); setFinal(null); }}
                    className={`text-right rounded-xl border p-3 transition-colors ${mode === m.value ? "border-brand-violet bg-brand-violet/5" : "border-line hover:border-brand-violet/40"}`}>
                    <span className="block text-[13px] font-semibold text-ink">{m.label}</span>
                    <span className="block text-[11px] text-ink-muted mt-1 leading-relaxed">{m.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[13px]">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-brand-violet w-4 h-4" checked={autoCreate} onChange={(e) => { setAutoCreate(e.target.checked); setDry(null); setFinal(null); }} />
                  <span>دسته‌های ناموجود به‌صورت خودکار ساخته شوند <span className="text-ink-faint">(در گزارش اعلام می‌شود)</span></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-brand-violet w-4 h-4" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
                  <span>حالت سخت‌گیرانه <span className="text-ink-faint">(با وجود هر خطا، هیچ ردیفی وارد نشود)</span></span>
                </label>
              </div>
              <div className="flex items-center gap-3 mt-5">
                <button type="button" onClick={runDry} disabled={busy !== ""} className="btn-primary size-md disabled:opacity-60">
                  {busy === "dry" ? <Spinner /> : <Icon name="search" size={17} />}
                  {busy === "dry" ? "در حال بررسی…" : "بررسی فایل (بدون ذخیره)"}
                </button>
                {busy && progress && <span className="text-xs text-ink-muted tabular">{progress.done}/{progress.total}</span>}
              </div>
            </SectionCard>
          )}

          {/* Step 3 — preview / report */}
          {view && (
            <SectionCard
              title={final ? "۴) گزارش نهایی" : "۳) پیش‌نمایش"}
              desc={final ? "نتیجهٔ واقعی ورود" : "این فقط پیش‌بینی است — هنوز چیزی ذخیره نشده"}
              icon={final ? "badgeCheck" : "eye"}
            >
              {final?.connectionError && (
                <div className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn">
                  <Icon name="alertTriangle" size={16} /> {final.connectionError}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {[
                  ["all", `همه ${view.counts.total}`],
                  ["create", `ساخت ${view.counts.create}`],
                  ["update", `بروزرسانی ${view.counts.update}`],
                  ["skip", `رد ${view.counts.skip}`],
                  ["error", `خطا ${view.counts.error}`],
                  ["warning", `هشدار ${view.counts.warnings}`],
                ].map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFilter(key)}
                    className={`pill !text-[11px] font-semibold transition-colors ${filter === key ? "bg-brand-violet text-white" : "bg-line-soft text-ink-muted hover:text-ink"}`}>
                    {label}
                  </button>
                ))}
                {view.createdCategories.length > 0 && (
                  <Badge tone="violet">دسته‌های جدید: {view.createdCategories.join("، ")}</Badge>
                )}
              </div>

              <div className="max-h-[26rem] overflow-auto rounded-xl border border-line">
                <table className="w-full text-[12px]" dir="rtl">
                  <thead className="sticky top-0 bg-canvas-soft">
                    <tr className="text-ink-muted border-b border-line">
                      <th className="px-2.5 py-2 font-medium text-right w-14">ردیف</th>
                      <th className="px-2.5 py-2 font-medium text-right">محصول</th>
                      <th className="px-2.5 py-2 font-medium text-right w-24">وضعیت</th>
                      <th className="px-2.5 py-2 font-medium text-right">پیام‌ها</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((r) => (
                      <tr key={r.rowNum} className={r.status === "error" ? "bg-warn/5" : ""}>
                        <td className="px-2.5 py-2 text-ink-faint tabular">{r.rowNum}</td>
                        <td className="px-2.5 py-2 text-ink max-w-[220px] truncate">{nameOf(r.rowNum)}</td>
                        <td className="px-2.5 py-2"><Badge tone={STATUS_TONE[r.status]}>{STATUS_FA[r.status] || r.status}</Badge></td>
                        <td className="px-2.5 py-2 text-ink-muted leading-relaxed">
                          {[...(r.messages || []), ...(r.warnings || [])].join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                    {!filtered.length && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-faint text-sm">ردیفی با این فیلتر نیست.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                {!final && (
                  <button
                    type="button"
                    onClick={runCommit}
                    disabled={busy !== "" || (strict && view.counts.error > 0) || (view.counts.create + view.counts.update === 0)}
                    className="btn-primary size-md disabled:opacity-60"
                  >
                    {busy === "commit" ? <Spinner /> : <Icon name="save" size={17} />}
                    {busy === "commit" ? "در حال ورود…" : `تأیید و ورود (${view.counts.create} ساخت، ${view.counts.update} بروزرسانی)`}
                  </button>
                )}
                {busy === "commit" && progress && <span className="text-xs text-ink-muted tabular">{progress.done}/{progress.total}</span>}
                {strict && !final && view.counts.error > 0 && <Badge tone="warn">حالت سخت‌گیرانه: اول خطاها را رفع کنید</Badge>}
                <button type="button" onClick={downloadReport} className="btn-ghost size-md"><Icon name="download" size={16} /> دانلود گزارش CSV</button>
                {final && <button type="button" onClick={reset} className="btn-ghost size-md"><Icon name="refresh" size={16} /> فایل جدید</button>}
              </div>
            </SectionCard>
          )}
        </div>

        {/* side: history */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <SectionCard title="سابقهٔ ورودها" icon="clock" desc={recentLogs.length ? "" : "بعد از اولین ورود (و اجرای مایگریشن ۰۸) اینجا پر می‌شود"}>
            {recentLogs.length ? (
              <div className="flex flex-col divide-y divide-line text-[12px]">
                {recentLogs.map((l) => (
                  <div key={l.id} className="py-2.5">
                    <div className="flex items-center gap-2">
                      <Icon name={l.source === "bulk" ? "plusCircle" : "upload"} size={14} className="text-brand-violet shrink-0" />
                      <span className="font-medium text-ink truncate" dir="ltr">{l.file_name || (l.source === "bulk" ? "افزودن گروهی" : "—")}</span>
                    </div>
                    <p className="text-ink-muted mt-1">
                      {new Date(l.created_at).toLocaleString("fa-IR")} · {l.total_rows} ردیف · {l.created_count} ساخت · {l.updated_count} بروزرسانی{l.error_count ? ` · ${l.error_count} خطا` : ""}{l.categories_created ? ` · ${l.categories_created} دسته جدید` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">هنوز سابقه‌ای ثبت نشده.</p>
            )}
          </SectionCard>
          <SectionCard title="نکته‌ها" icon="shield">
            <ul className="text-[12px] text-ink-soft space-y-2 leading-relaxed list-disc pr-4">
              <li>کلید تطبیق: اول SKU (بدون حساسیت به بزرگی حروف)، بعد اسلاگ.</li>
              <li>در حالت بروزرسانی، سلول خالی یعنی «بدون تغییر» — داده‌ای پاک نمی‌شود.</li>
              <li>تصویر: آدرس اینترنتی یا مسیر Storage موجود. آپلود فایل تصویر از صفحهٔ خود محصول.</li>
              <li>حداکثر {MAX_ROWS_PER_FILE} ردیف در هر فایل (برای پایداری سرور).</li>
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
