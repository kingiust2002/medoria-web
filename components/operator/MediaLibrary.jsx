"use client";
// The image library of BOTH panels: every uploaded file of this house, where it is used, copy its link, upload a new one, remove one
// that nothing uses. The server checks usage again at removal; "needs approval" people file a request instead.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { PageHeader, Badge, EmptyState, Spinner } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import { tr } from "@/lib/panel/i18n";

const KIND = { product: tr("محصول"), category: tr("دسته"), brand: tr("برند"), request: tr("درخواست تغییر در انتظار") };
const size = (n) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function MediaLibrary({ data, actions }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const router = useRouter();
  const canUpload = useCan("media.upload"), canDelete = useCan("media.delete");
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState("all");            // all | unused
  const [busy, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(null);
  const fileRef = useRef(null);

  if (!data?.ok) {
    return (<><PageHeader title={t("کتابخانهٔ تصویر")} /><div role="alert" className="text-sm rounded-xl px-3 py-2.5 bg-warn/10 text-warn">{t(data?.error || "کتابخانهٔ تصویر در دسترس نیست.")}</div></>);
  }
  const items = filter === "unused" ? data.items.filter((i) => i.usedBy.length === 0) : data.items;

  function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await actions.uploadProductImage(fd);
      if (res.ok) { setMsg({ ok: true, text: t("تصویر بارگذاری شد.") }); router.refresh(); } else setMsg({ ok: false, text: t(res.error) });
    });
  }
  function remove() {
    const it = confirm;
    startTransition(async () => {
      const res = await actions.deleteMediaFile({ bucket: it.bucket, path: it.path });
      setConfirm(null);
      if (res.ok && res.pending) setMsg({ ok: true, text: t(res.message) });
      else if (res.ok) { setMsg({ ok: true, text: t("تصویر حذف شد.") }); router.refresh(); }
      else { setMsg({ ok: false, text: t(res.error) }); if (res.inUse) router.refresh(); }
    });
  }
  async function copy(url) {
    try { await navigator.clipboard.writeText(url); setMsg({ ok: true, text: t("نشانی کپی شد.") }); } catch { setMsg({ ok: false, text: url }); }
  }

  return (
    <>
      <PageHeader title={t("کتابخانهٔ تصویر")} subtitle={t("{length} فایل", { length: data.items.length })}>
        {canUpload && (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={upload} data-testid="media-file" aria-label={t("بارگذاری تصویر")} />
            <button type="button" className="btn-primary size-md" onClick={() => fileRef.current?.click()} disabled={busy} data-testid="media-upload">{busy ? <Spinner /> : <Icon name="upload" size={17} />} {t("بارگذاری تصویر")}</button>
          </>
        )}
      </PageHeader>
      {msg && <div role="status" className={`mb-4 text-sm rounded-xl px-3 py-2.5 break-words ${msg.ok ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`} data-testid="media-msg">{msg.text}</div>}
      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {[["all", t("همه")], ["unused", t("بدون استفاده")]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} data-testid={`media-filter-${id}`}
            className={`btn-ghost size-sm ${filter === id ? "!border-brand-violet/50 !text-brand-violet !bg-brand-violet/5" : ""}`}>{label}</button>
        ))}
      </div>
      {items.length === 0 ? <EmptyState icon="image" title={t("تصویری وجود ندارد")} /> : (
        <ul className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3" data-testid="media-grid">
          {items.map((it) => (
            <li key={`${it.bucket}/${it.path}`} className="card overflow-hidden min-w-0 flex flex-col" data-testid="media-item" data-unused={it.usedBy.length === 0}>
              <div className="img-ph aspect-[4/3] grid place-items-center text-ink-faint">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
              <div className="p-2.5 flex flex-col gap-1.5 min-w-0 flex-1">
                <p className="text-xs text-ink break-all" dir="ltr">{it.name}</p>
                <p className="text-[11px] text-ink-faint">{[size(it.size), it.created_at ? fmtDate(it.created_at) : ""].filter(Boolean).join(" · ")}</p>
                <div className="flex flex-wrap gap-1">
                  {it.usedBy.length === 0 ? <Badge tone="muted">{t("بدون استفاده")}</Badge> : it.usedBy.slice(0, 3).map((u) => <Badge key={`${u.kind}${u.id}`} tone="ok" className="max-w-full truncate" title={String(u.label)}>{t(KIND[u.kind] || u.kind)}: {String(u.label)}</Badge>)}
                  {it.usedBy.length > 3 && <Badge tone="neutral">+{it.usedBy.length - 3}</Badge>}
                </div>
                <div className="flex gap-1 mt-auto pt-1">
                  <button type="button" className="btn-ghost size-sm" onClick={() => copy(it.url)}><Icon name="copy" size={14} /> {t("کپی نشانی")}</button>
                  {canDelete && it.usedBy.length === 0 && <button type="button" className="btn-ghost size-sm !text-warn" onClick={() => setConfirm(it)} data-testid="media-delete"><Icon name="trash" size={14} /> {t("حذف")}</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.truncated && <p className="text-xs text-ink-faint mt-3">{t("فقط جدیدترین ۲۰۰ فایل هر پوشه نشان داده شد.")}</p>}
      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={() => setConfirm(null)} role="dialog" aria-modal="true" aria-label={t("حذف تصویر")}>
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()} className="relative card p-5 w-full max-w-md min-w-0" data-testid="media-confirm">
            <h2 className="font-bold text-lg text-ink mb-2">{t("حذف تصویر")}</h2>
            <p className="text-sm text-ink-soft mb-4 break-all" dir="ltr">{confirm.path}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-primary size-md flex-1 !bg-warn hover:!bg-warn/90" onClick={remove} disabled={busy} data-testid="media-confirm-yes">{busy ? <Spinner /> : <Icon name="trash" size={16} />} {t("حذف")}</button>
              <button type="button" className="btn-ghost size-md" onClick={() => setConfirm(null)}>{t("انصراف")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
