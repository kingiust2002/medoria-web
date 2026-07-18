"use client";
// app/login/LoginChooser.jsx — simple, professional two-language admin door.
// Neutral surface: default (non-vertical) tokens, the master "Medoria"
// wordmark alone at the top (no Health/Beauty suffix — the one neutral
// parent mark per brand law), and each option card wears ONLY its own
// vertical's official lockup. No cross-logo mixing.
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import Brand from "@/components/layout/Brand";
import { BeautyWordLockup } from "@/components/beauty/BeautyBrand";

const COPY = {
  fa: {
    dir: "rtl",
    eyebrow: "ورود کارکنان",
    title: "به کدام پنل می‌روید؟",
    subtitle: "هر پنل کاملاً مستقل است — با حساب کاربری مخصوص همان بخش وارد شوید.",
    health: { name: "پنل مدیریت Health", desc: "مدیریت محصولات، دسته‌ها و استعلام‌های تجهیزات پزشکی" },
    beauty: { name: "پنل مدیریت Beauty", desc: "مدیریت محصولات، دسته‌ها و استعلام‌های زیبایی لوکس" },
    enter: "ورود",
    footer: "دسترسی فقط برای کارکنان مجاز. تمام فعالیت‌ها ثبت می‌شود.",
  },
  en: {
    dir: "ltr",
    eyebrow: "Staff sign-in",
    title: "Which panel are you here for?",
    subtitle: "Each panel is fully independent — sign in with that panel's own account.",
    health: { name: "Health Admin Panel", desc: "Manage medical products, categories and quote requests" },
    beauty: { name: "Beauty Admin Panel", desc: "Manage luxury products, categories and quote requests" },
    enter: "Enter",
    footer: "Authorized staff only. All activity is logged.",
  },
};

export default function LoginChooser() {
  const [lang, setLang] = useState("fa");
  const t = COPY[lang];

  return (
    <div dir={t.dir} lang={lang} className="min-h-screen bg-canvas text-ink flex flex-col">
      {/* Language toggle */}
      <div className="container-x pt-6 flex justify-end">
        <div className="inline-flex rounded-full border border-line bg-surface p-1 text-[12px] font-semibold">
          <button
            onClick={() => setLang("fa")}
            className={`px-3 py-1.5 rounded-full transition-colors ${lang === "fa" ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"}`}
          >
            فارسی
          </button>
          <button
            onClick={() => setLang("en")}
            className={`px-3 py-1.5 rounded-full transition-colors ${lang === "en" ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink"}`}
          >
            English
          </button>
        </div>
      </div>

      <main className="flex-1 grid place-items-center px-4 py-10">
        <div className="w-full max-w-3xl">
          {/* Neutral master mark — no vertical suffix here */}
          <div className="flex flex-col items-center text-center gap-3 mb-10">
            <span className="inline-flex items-center gap-2.5">
              <img src="/logo-mark.png" alt="" aria-hidden="true" width={34} height={34} className="shrink-0 object-contain" />
              <span dir="ltr" translate="no">
                <img src="/brand/wordmark-navy.png" alt="Medoria" style={{ height: 26 }} className="w-auto object-contain dark:hidden" />
                <img src="/brand/wordmark-white.png" alt="Medoria" style={{ height: 26 }} className="w-auto object-contain hidden dark:block" />
              </span>
            </span>
            <div>
              <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-ink-faint mb-1.5">{t.eyebrow}</p>
              <h1 className="text-2xl md:text-3xl font-bold font-display text-ink">{t.title}</h1>
              <p className="text-sm text-ink-muted mt-2 max-w-md mx-auto">{t.subtitle}</p>
            </div>
          </div>

          {/* Two panel choices */}
          <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
            <Link
              href="/login/health"
              className="group card card-hover p-6 flex flex-col items-center text-center gap-4 transition-all hover:-translate-y-0.5"
            >
              <span className="grid place-items-center w-14 h-14 rounded-2xl bg-primary/10 text-primary shrink-0">
                <Icon name="stethoscope" size={26} strokeWidth={1.6} />
              </span>
              <Brand height={26} />
              <div>
                <p className="font-semibold text-ink">{t.health.name}</p>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">{t.health.desc}</p>
              </div>
              <span className="btn-primary size-md w-full mt-1">
                {t.enter} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={15} />
              </span>
            </Link>

            <Link
              href="/login/beauty"
              className="group card card-hover p-6 flex flex-col items-center text-center gap-4 transition-all hover:-translate-y-0.5"
            >
              <span className="grid place-items-center w-14 h-14 rounded-2xl shrink-0"
                style={{ background: "color-mix(in srgb, #B87D4E 12%, transparent)", color: "#9A5F33" }}>
                <Icon name="sparkles" size={26} strokeWidth={1.6} />
              </span>
              <span className="inline-flex items-center rounded-full bg-white ring-1 ring-line px-3 py-1.5 dark:bg-white/95">
                <BeautyWordLockup height={22} />
              </span>
              <div>
                <p className="font-semibold text-ink">{t.beauty.name}</p>
                <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">{t.beauty.desc}</p>
              </div>
              <span className="btn-primary size-md w-full mt-1"
                style={{ backgroundImage: "linear-gradient(120deg,#1C2951,#C87D4E)" }}>
                {t.enter} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={15} />
              </span>
            </Link>
          </div>

          <div className="flex items-center justify-center gap-2 mt-8 text-[12px] text-ink-faint">
            <Icon name="lock" size={13} />
            {t.footer}
          </div>
        </div>
      </main>
    </div>
  );
}
