// components/product/VariantPicker.jsx — the options of a product that has variants (size, colour, pack…), shared by the Health and the
// Beauty product page. The owner's axis names and values are shown as written; the only fixed text is the heading. A value that does not exist
// together with the current choice is not blocked: picking it moves to the nearest variant that has it (see pickVariant).
"use client";
import { groupAxes, pickVariant } from "@/lib/operator/variants";

const HEADING = { fa: "گزینه‌ها", tg: "Вариантҳо", ru: "Варианты", en: "Options" };

export default function VariantPicker({ variants, selected, onSelect, lang, className = "" }) {
  const axes = groupAxes(variants);
  if (!axes.length) return null;
  const current = selected?.options || {};
  return (
    <fieldset className={`min-w-0 ${className}`} data-testid="variant-picker">
      <legend className="sr-only">{HEADING[lang] || HEADING.en}</legend>
      <div className="space-y-3">
        {axes.map((axis) => (
          <div key={axis.key} className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint mb-1.5 break-words">
              {axis.key}: <span className="text-ink normal-case tracking-normal">{current[axis.key]}</span>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={axis.key}>
              {axis.values.map((value) => {
                const on = current[axis.key] === value;
                return (
                  <button
                    key={value} type="button" role="radio" aria-checked={on} data-variant-value={value}
                    onClick={() => { const v = pickVariant(variants, current, axis.key, value); if (v) onSelect(v); }}
                    className={[
                      "min-h-10 max-w-full px-3.5 rounded-lg text-[13px] font-semibold border transition-colors break-words",
                      on ? "bg-ink text-white border-ink" : "bg-surface text-ink-muted border-line hover:border-ink/40 hover:text-ink",
                    ].join(" ")}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
