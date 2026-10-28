"use client";
// components/operator/DocumentsManager.jsx — the documents of ONE product on its edit page, for both houses (each passes its own server actions): brochure,
// datasheet, certificate, manual. A new document is always a DRAFT; making it public is a separate step with its own right (it may need approval).
// The server repeats every check; the buttons here are only a convenience. Only PDFs; the server looks at the file before it is stored.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { SectionCard, Field, Input, Select, Badge, Spinner } from "@/components/operator/ui";
import { imageUrl as healthImageUrl } from "@/lib/supabase";
import { beautyImageUrl } from "@/lib/beauty/catalog";
import { useT } from "@/components/panel/PanelI18n";
import { useCan, useMode } from "@/components/panel/Capabilities";
import { DOC_KINDS, DOC_KIND_LABELS, DOC_LANGS, DOC_LIMITS } from "@/lib/operator/documents";

const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);          // the team's calendar day (UTC+5)
const sizeText = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const LANG_NAMES = { tg: "Тоҷикӣ", ru: "Русский", en: "English" };          // each language in its own script; Persian goes through t()

export default function DocumentsManager({ house = "health", productId, documents, unavailable, actions, approvalsHref }) {
  const t = useT();
  const router = useRouter();
  const urlOf = house === "beauty" ? beautyImageUrl : healthImageUrl;          // a function cannot be passed from a server page: the house picks its bucket
  const canCreate = useCan("documents.create"), canEdit = useCan("documents.edit");
  const modePublish = useMode("documents.publish"), modeDelete = useMode("documents.delete");
  const langName = (l) => (l === "fa" ? t("فارسی") : LANG_NAMES[l]);
  const fileRef = useRef(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: "", kind: "brochure", lang: "", valid_until: "" });
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [ef, setEf] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  if (unavailable) {
    return (
      <SectionCard title={t("اسناد محصول")} desc={t("بروشور، برگهٔ مشخصات فنی، گواهی و راهنما")} icon="download">
        <p role="status" data-testid="documents-unavailable" className="text-sm text-ink-muted">{t("برای اسناد محصول، مایگریشن ۴۸ باید روی پایگاه داده اجرا شود.")}</p>
      </SectionCard>
    );
  }

  const run = async (fn, okText) => {
    if (busy) return null;
    setBusy(true); setErr(""); setNote("");
    let res;
    try { res = await fn(); } catch { res = null; }
    setBusy(false);
    if (res?.ok && res.pending) { setNote(t(res.message)); router.refresh(); return res; }
    if (res?.ok) { if (okText) setNote(okText); router.refresh(); return res; }
    setErr(t(res?.error) || t("ذخیرهٔ سند ناموفق بود."));
    if (res?.conflict) router.refresh();
    return null;
  };

  async function add(e) {
    e.preventDefault();
    if (!file) { setErr(t("فایلی انتخاب نشده است.")); return; }
    const fd = new FormData();
    fd.append("file", file);
    for (const k of ["title", "kind", "lang", "valid_until"]) fd.append(k, f[k]);
    const res = await run(() => actions.add(productId, fd), t("سند افزوده شد؛ هنوز پیش‌نویس است و روی سایت نیست."));
    if (res) { setAdding(false); setFile(null); setF({ title: "", kind: "brochure", lang: "", valid_until: "" }); if (fileRef.current) fileRef.current.value = ""; }
  }

  const pick = (e) => {
    const picked = e.target.files?.[0] || null;
    setFile(picked);
    setErr("");
    if (picked && !f.title.trim()) setF((s) => ({ ...s, title: picked.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, DOC_LIMITS.titleMax) }));
  };

  return (
    <SectionCard title={t("اسناد محصول")} desc={t("بروشور، برگهٔ مشخصات فنی، گواهی و راهنما — فقط PDF، حداکثر ۱۵ مگابایت. سند جدید ابتدا پیش‌نویس است.")} icon="download" className="min-w-0">
      <div data-testid="documents-manager" className="min-w-0">
        {note && <p role="status" data-testid="documents-note" className="mb-3 text-sm text-ok break-words">{note} {approvalsHref && modePublish === "approval" && <a href={approvalsHref} className="underline">{t("درخواست‌ها")}</a>}</p>}
        {err && <p role="alert" data-testid="documents-error" className="mb-3 text-sm text-warn break-words">{err}</p>}

        {documents.length === 0 && !adding && <p className="text-sm text-ink-muted mb-3" data-testid="documents-empty">{t("هنوز سندی برای این محصول نیست.")}</p>}
        <ul className="flex flex-col gap-3" data-testid="documents-list">
          {documents.map((d) => {
            const expired = d.valid_until && d.valid_until < today();
            const isEditing = editing === d.id;
            return (
              <li key={d.id} className="rounded-xl border border-line bg-canvas-soft p-3 min-w-0" data-testid="document-row">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 min-w-0">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-semibold text-ink break-words">{d.title}</p>
                    <p className="text-xs text-ink-muted break-words">{t(DOC_KIND_LABELS[d.kind])}{d.lang ? ` · ${langName(d.lang)}` : ""} · {sizeText(d.file_size)}{d.valid_until ? ` · ${t("اعتبار تا")} ${d.valid_until}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Badge tone={d.is_published ? "ok" : "muted"} data-testid="document-state">{d.is_published ? t("منتشرشده") : t("پیش‌نویس")}</Badge>
                    {expired && <Badge tone="warn">{t("منقضی")}</Badge>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={urlOf(d.file_path)} target="_blank" rel="noopener noreferrer" className="btn-ghost size-sm"><Icon name="eye" size={14} /> {t("مشاهده")}</a>
                  {canEdit && <button type="button" className="btn-ghost size-sm" data-testid="document-edit" onClick={() => { setEditing(isEditing ? null : d.id); setEf({ title: d.title, kind: d.kind, lang: d.lang || "", valid_until: d.valid_until || "" }); }}>{t("ویرایش")}</button>}
                  {!d.is_published && modePublish !== "denied" && <button type="button" disabled={busy} className="btn-primary size-sm" data-testid="document-publish" onClick={() => run(() => actions.publish(d.id, true, d.version), t("سند روی سایت منتشر شد."))}>{modePublish === "approval" ? t("ارسال برای تأیید انتشار") : t("انتشار")}</button>}
                  {d.is_published && canEdit && <button type="button" disabled={busy} className="btn-ghost size-sm" data-testid="document-hide" onClick={() => run(() => actions.publish(d.id, false, d.version), t("سند از سایت برداشته شد."))}>{t("پنهان‌کردن")}</button>}
                  {modeDelete !== "denied" && (confirmDelete === d.id
                    ? <><button type="button" disabled={busy} className="btn-primary size-sm !bg-warn" data-testid="document-delete-confirm" onClick={() => { setConfirmDelete(null); run(() => actions.remove(d.id, d.version), t("سند حذف شد.")); }}>{modeDelete === "approval" ? t("ارسال درخواست حذف") : t("بله، حذف شود")}</button><button type="button" className="btn-ghost size-sm" onClick={() => setConfirmDelete(null)}>{t("انصراف")}</button></>
                    : <button type="button" disabled={busy} className="btn-ghost size-sm !text-warn" data-testid="document-delete" onClick={() => setConfirmDelete(d.id)}><Icon name="trash" size={14} /> {t("حذف")}</button>)}
                </div>
                {isEditing && (
                  <form className="mt-3 grid sm:grid-cols-2 gap-3 min-w-0" data-testid="document-edit-form" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => actions.update(d.id, ef, d.version), t("سند ذخیره شد.")); if (r) setEditing(null); }}>
                    <Field label={t("عنوان سند")} required><Input value={ef.title} onChange={(e) => setEf((s) => ({ ...s, title: e.target.value }))} maxLength={DOC_LIMITS.titleMax} /></Field>
                    <Field label={t("نوع سند")}><Select value={ef.kind} onChange={(e) => setEf((s) => ({ ...s, kind: e.target.value }))}>{DOC_KINDS.map((k) => <option key={k} value={k}>{t(DOC_KIND_LABELS[k])}</option>)}</Select></Field>
                    <Field label={t("زبان سند")}><Select value={ef.lang} onChange={(e) => setEf((s) => ({ ...s, lang: e.target.value }))}><option value="">{t("— نامشخص —")}</option>{DOC_LANGS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}</Select></Field>
                    <Field label={t("معتبر تا (اختیاری)")}><Input type="date" dir="ltr" value={ef.valid_until} onChange={(e) => setEf((s) => ({ ...s, valid_until: e.target.value }))} /></Field>
                    <div className="sm:col-span-2 flex flex-wrap gap-2"><button type="submit" disabled={busy} className="btn-primary size-sm">{busy ? <Spinner /> : null} {t("ذخیره")}</button><button type="button" className="btn-ghost size-sm" onClick={() => setEditing(null)}>{t("انصراف")}</button></div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>

        {canCreate && !adding && <button type="button" className="btn-ghost size-md mt-3" data-testid="document-add" onClick={() => { setAdding(true); setErr(""); setNote(""); }}><Icon name="plus" size={16} /> {t("افزودن سند")}</button>}
        {canCreate && adding && (
          <form onSubmit={add} className="mt-3 rounded-xl border border-line p-3 grid sm:grid-cols-2 gap-3 min-w-0" data-testid="document-form">
            <div className="sm:col-span-2 min-w-0">
              <Field label={t("فایل PDF")} required>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={pick} data-testid="document-file" className="input w-full text-xs" />
              </Field>
            </div>
            <Field label={t("عنوان سند")} required><Input value={f.title} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} maxLength={DOC_LIMITS.titleMax} data-testid="document-title" /></Field>
            <Field label={t("نوع سند")}><Select value={f.kind} onChange={(e) => setF((s) => ({ ...s, kind: e.target.value }))} data-testid="document-kind">{DOC_KINDS.map((k) => <option key={k} value={k}>{t(DOC_KIND_LABELS[k])}</option>)}</Select></Field>
            <Field label={t("زبان سند")}><Select value={f.lang} onChange={(e) => setF((s) => ({ ...s, lang: e.target.value }))}><option value="">{t("— نامشخص —")}</option>{DOC_LANGS.map((l) => <option key={l} value={l}>{langName(l)}</option>)}</Select></Field>
            <Field label={t("معتبر تا (اختیاری)")} hint={t("برای گواهی: پس از این تاریخ از سایت برداشته می‌شود")}><Input type="date" dir="ltr" value={f.valid_until} onChange={(e) => setF((s) => ({ ...s, valid_until: e.target.value }))} /></Field>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className="btn-primary size-md" data-testid="document-submit">{busy ? <Spinner /> : <Icon name="upload" size={16} />} {t("آپلود سند")}</button>
              <button type="button" className="btn-ghost size-md" onClick={() => { setAdding(false); setErr(""); }}>{t("انصراف")}</button>
            </div>
          </form>
        )}
      </div>
    </SectionCard>
  );
}
