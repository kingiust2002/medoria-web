"use client";
// What a visitor of each language sees of the product being edited (name and description with the public site's own fallback to English),
// and what is still missing before it is worth publishing. Shown inside the live preview of both product forms. It only points at gaps;
// it never blocks a save and never fills anything in.
import { useState } from "react";
import { Badge } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import { PREVIEW_LANGS, isFallback, visitorView } from "@/lib/operator/previewView";
import { gapLabel, productGaps } from "@/lib/operator/completeness";

export default function PreviewLanguages({ values, product }) {
  const t = useT();
  const [lang, setLang] = useState("tg");
  const v = visitorView(values, lang);
  const gaps = productGaps(product);
  return (
    <div className="mt-4" data-testid="preview-languages">
      <div role="tablist" className="flex flex-wrap gap-1 mb-2">
        {PREVIEW_LANGS.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={lang === l} onClick={() => setLang(l)} data-testid={`pv-lang-${l}`}
            className={`btn-ghost size-sm uppercase ${lang === l ? "!border-brand-violet/50 !text-brand-violet !bg-brand-violet/5" : ""}`}>{l}</button>
        ))}
      </div>
      <div className="card-flat p-3 min-w-0" dir={v.dir} data-testid="pv-view">
        <p className="font-semibold text-ink break-words" data-testid="pv-name">{v.name || "—"}</p>
        {isFallback(v.nameFrom, lang) && <Badge tone="warn" className="mt-1" data-testid="pv-name-fallback">{t("نام به زبان {lang} نشان داده می‌شود", { lang: v.nameFrom.toUpperCase() })}</Badge>}
        {!v.name && <Badge tone="warn" className="mt-1">{t("نامی برای نمایش وجود ندارد")}</Badge>}
        <p className="text-sm text-ink-soft mt-2 break-words line-clamp-4" data-testid="pv-description">{v.description || "—"}</p>
        {isFallback(v.descriptionFrom, lang) && <Badge tone="warn" className="mt-1" data-testid="pv-description-fallback">{t("توضیح به زبان {lang} نشان داده می‌شود", { lang: v.descriptionFrom.toUpperCase() })}</Badge>}
      </div>
      <div className="mt-3" data-testid="pv-checklist">
        {gaps.length === 0 ? (
          <p className="text-xs text-ok">{t("همهٔ موارد صفحهٔ محصول کامل است.")}</p>
        ) : (
          <>
            <p className="text-xs font-semibold text-ink-soft mb-1">{t("هنوز کامل نیست ({count} مورد):", { count: gaps.length })}</p>
            <ul className="text-xs text-ink-muted space-y-0.5 list-disc ps-4">
              {gaps.map((g) => <li key={g.code}>{gapLabel(g, t)}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
