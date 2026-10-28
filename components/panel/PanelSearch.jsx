"use client";
// components/panel/PanelSearch.jsx — the quick search of both panels. Opens with "/" (outside a text field) or Ctrl/⌘+K, or from any
// element that dispatches the "panel-search:open" window event (the menu buttons do). The search itself is a server action of the panel
// (session + the same permissions as the pages); results are short facts and links.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { useT } from "@/components/panel/PanelI18n";
import { tr } from "@/lib/panel/i18n";

export const OPEN_EVENT = "panel-search:open";
const GROUP = { products: tr("محصولات"), quotes: tr("استعلام‌ها"), categories: tr("دسته‌بندی‌ها"), brands: tr("برندها"), users: tr("کاربران") };
const MIN = 2;

export function SearchTrigger({ className = "", children, label }) {
  return (
    <button type="button" className={className} aria-label={label} data-testid="search-open" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      {children}
    </button>
  );
}

export default function PanelSearch({ search }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState([]);
  const [state, setState] = useState("idle");          // idle | loading | done | error
  const ticket = useRef(0);
  const input = useRef(null);
  const list = useRef(null);

  const close = useCallback(() => { setOpen(false); setQ(""); setGroups([]); setState("idle"); }, []);

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
      else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setOpen(true); }
      else if (e.key === "Escape") close();
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_EVENT, onOpen); };
  }, [close]);

  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const term = q.trim();
    if (term.length < MIN) { setGroups([]); setState("idle"); return undefined; }
    const mine = ++ticket.current;
    setState("loading");
    const timer = setTimeout(async () => {
      let res = null;
      try { res = await search(term); } catch { res = null; }
      if (mine !== ticket.current) return;               // an older answer never replaces a newer one
      if (res?.ok) { setGroups(res.groups); setState("done"); } else { setGroups([]); setState("error"); }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open, search]);

  if (!open) return null;
  const links = () => [...(list.current?.querySelectorAll("a") || [])];
  function onInputKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); links()[0]?.focus(); }
    else if (e.key === "Enter") links()[0]?.click();
  }
  function onListKey(e) {
    const all = links(), i = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); all[Math.min(i + 1, all.length - 1)]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (i <= 0) input.current?.focus(); else all[i - 1].focus(); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" onClick={close} role="dialog" aria-modal="true" aria-label={t("جستجو")} data-testid="search-dialog">
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative card w-full max-w-xl min-w-0 max-h-[75vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 border-b border-line">
          <Icon name="search" size={18} className="text-ink-faint shrink-0" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onInputKey} maxLength={80} autoComplete="off" spellCheck={false}
            placeholder={t("جستجوی محصول، استعلام، دسته، کاربر…")} aria-label={t("جستجو")} data-testid="search-input" className="flex-1 min-w-0 h-12 bg-transparent outline-none text-ink" />
          <button type="button" onClick={close} aria-label={t("بستن")} className="grid place-items-center w-8 h-8 rounded-lg hover:bg-line-soft text-ink-muted shrink-0"><Icon name="close" size={16} /></button>
        </div>
        <div ref={list} onKeyDown={onListKey} className="overflow-auto p-2" data-testid="search-results" aria-live="polite">
          {state === "idle" && <p className="px-2 py-6 text-sm text-ink-muted text-center">{t("حداقل ۲ حرف بنویسید.")}</p>}
          {state === "loading" && <p className="px-2 py-6 text-sm text-ink-muted text-center">{t("در حال جستجو…")}</p>}
          {state === "error" && <p role="alert" className="px-2 py-6 text-sm text-warn text-center">{t("جستجو انجام نشد.")}</p>}
          {state === "done" && groups.length === 0 && <p className="px-2 py-6 text-sm text-ink-muted text-center">{t("چیزی پیدا نشد.")}</p>}
          {state === "done" && groups.map((g) => (
            <section key={g.kind} className="mb-2" data-testid={`search-group-${g.kind}`}>
              <h3 className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{t(GROUP[g.kind] || g.kind)}</h3>
              <ul>
                {g.items.map((it) => (
                  <li key={`${g.kind}${it.id}`}>
                    <Link href={it.href} onClick={close} className="flex flex-col gap-0.5 px-2 py-2 rounded-lg hover:bg-line-soft focus:bg-line-soft outline-none min-w-0">
                      <span className="text-sm text-ink break-words">{it.title}{it.inactive ? <span className="text-ink-faint"> · {t("غیرفعال")}</span> : null}</span>
                      {it.sub && <span className="text-xs text-ink-muted break-words" dir="ltr">{it.sub}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
