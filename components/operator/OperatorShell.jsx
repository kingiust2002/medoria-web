"use client";
// components/operator/OperatorShell.jsx — sidebar + topbar chrome for the panel.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import Icon from "@/components/shared/Icon";

const NAV = [
  { href: "/operator", label: "داشبورد", icon: "dashboard" },
  { href: "/operator/products", label: "محصولات", icon: "package" },
  { href: "/operator/categories", label: "دسته‌بندی‌ها", icon: "layers" },
  { href: "/operator/quotes", label: "استعلام‌ها", icon: "quote" },
  { href: "/operator/settings", label: "تنظیمات", icon: "settings" },
];

function Brandblock() {
  return (
    <Link href="/operator" className="flex items-center gap-2.5 px-1">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-brand-gradient text-white font-extrabold">M</span>
      <span className="leading-tight">
        <span className="block font-display font-bold text-ink">Medoria</span>
        <span className="block text-[10px] text-ink-faint tracking-wide">پنل اپراتور</span>
      </span>
    </Link>
  );
}

export default function OperatorShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const isActive = (href) => (href === "/operator" ? pathname === "/operator" : pathname.startsWith(href));

  async function logout() {
    try { await fetch("/api/operator/logout", { method: "POST" }); } catch {}
    router.push("/operator/login");
    router.refresh();
  }

  function NavLinks({ onNavigate }) {
    return (
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-medium transition-colors ${
              isActive(item.href) ? "bg-brand-violet/15 text-brand-violet" : "text-ink-muted hover:bg-line-soft hover:text-ink"
            }`}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[264px_1fr] min-h-screen">
      {/* Desktop sidebar (right side in RTL) */}
      <aside className="hidden lg:flex flex-col gap-6 border-l border-line bg-surface p-4 sticky top-0 h-screen">
        <div className="pt-2"><Brandblock /></div>
        <NavLinks />
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-medium text-ink-muted hover:bg-line-soft hover:text-ink transition-colors"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            {theme === "dark" ? "حالت روشن" : "حالت تیره"}
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-medium text-ink-muted hover:bg-warn/10 hover:text-warn transition-colors"
          >
            <Icon name="logout" size={18} />
            خروج
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex flex-col min-h-screen">
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 h-14 px-4 border-b border-line bg-surface/90 backdrop-blur-xl">
          <button onClick={() => setOpen(true)} className="grid place-items-center w-10 h-10 rounded-xl hover:bg-line-soft text-ink" aria-label="منو">
            <Icon name="menu" size={20} />
          </button>
          <Brandblock />
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="grid place-items-center w-10 h-10 rounded-xl hover:bg-line-soft text-ink-muted"
            aria-label="تغییر تم"
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
          </button>
        </header>

        <main className="flex-1 w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
          <aside
            dir="rtl"
            className="absolute top-0 bottom-0 right-0 w-72 bg-surface p-4 flex flex-col gap-6 shadow-card animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pt-1">
              <Brandblock />
              <button onClick={() => setOpen(false)} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted" aria-label="بستن">
                <Icon name="close" size={18} />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-medium text-ink-muted hover:bg-line-soft hover:text-ink"
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
                {theme === "dark" ? "حالت روشن" : "حالت تیره"}
              </button>
              <button onClick={logout} className="flex items-center gap-3 px-3.5 h-11 rounded-xl text-sm font-medium text-ink-muted hover:bg-warn/10 hover:text-warn">
                <Icon name="logout" size={18} />
                خروج
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
