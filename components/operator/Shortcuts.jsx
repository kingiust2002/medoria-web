"use client";
// The person's pinned shortcuts under the menu (N10). `items` are already limited to what the person may open (server side); a dead one is never shown.
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { useT } from "@/components/panel/PanelI18n";

export default function Shortcuts({ items, onNavigate }) {
  const t = useT();
  if (!items?.length) return null;
  return (
    <nav aria-label={t("میانبرهای من")} className="flex flex-col gap-1 border-t border-line pt-3" data-testid="shortcuts">
      <p className="px-3.5 pb-1 text-[11px] font-semibold text-ink-faint">{t("میانبرهای من")}</p>
      {items.map((x) => (
        <Link key={x.href} href={x.href} onClick={onNavigate} className="flex items-center gap-3 px-3.5 h-10 rounded-xl text-sm text-ink-muted hover:bg-line-soft hover:text-ink transition-colors min-w-0" data-testid="shortcut-link">
          <Icon name={x.icon} size={16} className="shrink-0" /><span className="truncate">{t(x.label)}</span>
        </Link>
      ))}
    </nav>
  );
}
