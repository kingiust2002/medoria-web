"use client";
// components/operator/ColumnsChooser.jsx — "my columns" for the product list and the request list of both panels (N9, round 3): choose which fields every row
// shows and in which order. The choice is the person's own (saved on the server, per house and list); `columns === null` (the old shared login, or the
// migration is not applied) shows no chooser and the lists keep their default fields. The server cleans the keys again against the same catalogue.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { useT } from "@/components/panel/PanelI18n";
import { COLUMN_CATALOG, DEFAULT_COLUMNS, effectiveColumns, cleanColumns } from "@/lib/operator/listColumns";

// the fields the table shows right now, in order: a hook so the table and the chooser share one state
export function useColumns(list, columns) {
  const [cols, setCols] = useState(() => effectiveColumns(list, columns?.saved));
  const savedKey = JSON.stringify(columns?.saved ?? null);
  useEffect(() => { setCols(effectiveColumns(list, columns?.saved)); }, [list, savedKey]);        // eslint-disable-line react-hooks/exhaustive-deps
  const order = useMemo(() => Object.fromEntries(cols.map((k, i) => [k, i])), [cols]);
  return { cols, setCols, has: (k) => k in order, order: (k) => order[k] ?? 0 };
}

export default function ColumnsChooser({ list, columns, state, actions }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(state.cols);
  const [msg, setMsg] = useState(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => { if (!open) setDraft(state.cols); }, [state.cols, open]);
  if (!columns) return null;

  const labels = Object.fromEntries(COLUMN_CATALOG[list]);
  const rest = COLUMN_CATALOG[list].map(([k]) => k).filter((k) => !draft.includes(k));
  const move = (k, d) => setDraft((cur) => { const i = cur.indexOf(k), j = i + d; if (i < 0 || j < 0 || j >= cur.length) return cur; const next = [...cur]; [next[i], next[j]] = [next[j], next[i]]; return next; });
  const toggle = (k) => setDraft((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.cols);

  function apply(res, after) {
    if (!res) { setMsg(t("ارتباط با سرور برقرار نشد.")); return; }
    if (!res.ok) { setMsg(t(res.error)); return; }
    state.setCols(after); setOpen(false); setMsg(null); router.refresh();
  }
  const save = () => { if (!cleanColumns(list, draft)) { setMsg(t("دست‌کم یک ستون را نگه دارید.")); return; } setMsg(null); startTransition(async () => apply(await actions.save(list, draft).catch(() => null), draft)); };
  const reset = () => { setMsg(null); startTransition(async () => apply(await actions.reset(list).catch(() => null), DEFAULT_COLUMNS[list])); };

  return (
    <div className="mb-4 min-w-0" data-testid="columns-chooser">
      <button type="button" onClick={() => { setOpen((o) => !o); setMsg(null); }} aria-expanded={open} className="btn-ghost size-sm" data-testid="columns-toggle">
        <Icon name="settings" size={15} /> {t("ستون‌های من")}
      </button>
      {open && (
        <div className="card mt-2 p-3 sm:p-4 max-w-md min-w-0" data-testid="columns-panel">
          <p className="text-xs text-ink-muted mb-2">{t("فیلدهایی که در هر ردیف دیده می‌شوند و ترتیب آن‌ها را انتخاب کنید.")}</p>
          <ul className="space-y-1">
            {draft.map((k, i) => (
              <li key={k} className="flex items-center gap-2 min-w-0" data-testid="column-on">
                <label className="flex items-center gap-2 flex-1 min-w-0 text-sm cursor-pointer">
                  <input type="checkbox" checked onChange={() => toggle(k)} className="w-4 h-4 accent-brand-violet shrink-0" data-column={k} />
                  <span className="truncate">{t(labels[k])}</span>
                </label>
                <button type="button" onClick={() => move(k, -1)} disabled={i === 0} className="grid place-items-center w-8 h-8 rounded-lg text-ink-muted hover:bg-line-soft disabled:opacity-30" aria-label={t("بالاتر")} data-testid="column-up"><Icon name="chevronDown" size={15} className="rotate-180" /></button>
                <button type="button" onClick={() => move(k, 1)} disabled={i === draft.length - 1} className="grid place-items-center w-8 h-8 rounded-lg text-ink-muted hover:bg-line-soft disabled:opacity-30" aria-label={t("پایین‌تر")} data-testid="column-down"><Icon name="chevronDown" size={15} /></button>
              </li>
            ))}
            {rest.map((k) => (
              <li key={k} className="flex items-center gap-2 min-w-0 opacity-80" data-testid="column-off">
                <label className="flex items-center gap-2 flex-1 min-w-0 text-sm cursor-pointer">
                  <input type="checkbox" checked={false} onChange={() => toggle(k)} className="w-4 h-4 accent-brand-violet shrink-0" data-column={k} />
                  <span className="truncate">{t(labels[k])}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary size-sm disabled:opacity-60" data-testid="columns-save">{t("ذخیره")}</button>
            <button type="button" onClick={reset} disabled={pending} className="btn-ghost size-sm" data-testid="columns-reset">{t("بازگشت به پیش‌فرض")}</button>
            <button type="button" onClick={() => { setOpen(false); setDraft(state.cols); setMsg(null); }} className="btn-ghost size-sm">{t("لغو")}</button>
          </div>
          {msg && <p role="alert" className="mt-2 text-sm text-warn min-w-0 break-words" data-testid="columns-error">{msg}</p>}
        </div>
      )}
    </div>
  );
}
