// components/operator/ui.jsx — small presentational building blocks for the panel.
// Pure components (no client hooks) — safe to use from server or client trees.
import Icon from "@/components/shared/Icon";

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold font-display text-ink tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

export function SectionCard({ title, desc, icon, children, className = "" }) {
  return (
    <section className={`card p-5 sm:p-6 ${className}`}>
      {(title || desc) && (
        <header className="mb-5 flex items-start gap-3">
          {icon && (
            <span className="shrink-0 grid place-items-center w-9 h-9 rounded-xl bg-brand-violet/10 text-brand-violet">
              <Icon name={icon} size={18} />
            </span>
          )}
          <div>
            {title && <h2 className="font-semibold text-ink">{title}</h2>}
            {desc && <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{desc}</p>}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, required, hint, error, children }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-[13px] font-medium text-ink-soft mb-1.5">
          {label}
          {required && <span className="text-brand-pink"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="block text-[11px] text-ink-faint mt-1 leading-relaxed">{hint}</span>}
      {error && <span className="block text-[11px] text-warn mt-1">{error}</span>}
    </label>
  );
}

export function Input(props) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`input w-full ${className}`} />;
}
export function Textarea(props) {
  const { className = "", rows = 3, ...rest } = props;
  return <textarea rows={rows} {...rest} className={`input w-full !h-auto py-2.5 leading-relaxed ${className}`} />;
}
export function Select(props) {
  const { className = "", ...rest } = props;
  return <select {...rest} className={`input w-full appearance-none cursor-pointer ${className}`} />;
}

export function Toggle({ checked, onChange, label, desc }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-right w-full group"
    >
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-brand-violet" : "bg-line"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "right-0.5" : "right-[1.375rem]"}`} />
      </span>
      {(label || desc) && (
        <span className="min-w-0">
          {label && <span className="block text-[13px] font-medium text-ink-soft">{label}</span>}
          {desc && <span className="block text-[11px] text-ink-faint">{desc}</span>}
        </span>
      )}
    </button>
  );
}

const BADGE_TONES = {
  neutral: "bg-line-soft text-ink-muted",
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  info: "bg-primary/10 text-primary",
  violet: "bg-brand-violet/10 text-brand-violet",
  pink: "bg-brand-pink/10 text-brand-pink",
};
export function Badge({ tone = "neutral", children, className = "" }) {
  return <span className={`pill font-semibold !text-[11px] ${BADGE_TONES[tone] || BADGE_TONES.neutral} ${className}`}>{children}</span>;
}

const STAT_TONES = {
  violet: "text-brand-violet bg-brand-violet/10",
  blue: "text-primary bg-primary/10",
  ok: "text-ok bg-ok/10",
  warn: "text-warn bg-warn/10",
  muted: "text-ink-muted bg-line-soft",
};
export function StatCard({ icon, label, value, tone = "violet" }) {
  return (
    <div className="card p-4 sm:p-5 flex items-center gap-4">
      <span className={`grid place-items-center w-11 h-11 rounded-xl shrink-0 ${STAT_TONES[tone] || STAT_TONES.violet}`}>
        <Icon name={icon} size={20} />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-ink tabular leading-none">{value}</div>
        <div className="text-xs text-ink-muted mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon = "package", title, desc, children }) {
  return (
    <div className="card-flat py-14 px-6 text-center flex flex-col items-center gap-3">
      <span className="grid place-items-center w-14 h-14 rounded-2xl bg-line-soft text-ink-faint">
        <Icon name={icon} size={26} />
      </span>
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {desc && <p className="text-sm text-ink-muted mt-1 max-w-sm">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return (
    <span
      className="inline-block rounded-full border-2 border-current border-t-transparent animate-spin align-[-2px]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// ── plain helpers (Persian-first, no i18n dependency) ─────────────────────────
export function productDisplayName(p) {
  return p?.name_fa || p?.name_en || p?.name_ru || p?.name_tg || p?.sku || `#${p?.id ?? ""}`;
}
export function isOnRequest(p) {
  return p == null || p.price == null || p.price === "" || Number(p.price) === 0;
}
export function priceText(p) {
  return isOnRequest(p) ? "استعلام قیمت" : `$${Number(p.price).toFixed(2)}`;
}
