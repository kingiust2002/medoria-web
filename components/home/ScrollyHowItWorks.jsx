// components/home/ScrollyHowItWorks.jsx — pinned, scroll-driven "how it works".
// As you scroll the tall section, the sticky panel stays and the active step
// (and its graphic) changes. No images required. Reduced-motion still usable.
"use client";
import { useRef, useState, useEffect } from "react";
import { motion, useScroll } from "framer-motion";
import Icon from "@/components/shared/Icon";

const COPY = {
  fa: { tag: "چطور کار می‌کنیم", title: "خرید آسان در چهار قدم", steps: [
    ["search", "جستجو در کاتالوگ", "هزاران قلم کالای پزشکی را مرور و فیلتر کنید."],
    ["chat", "ارسال استعلام", "در واتساپ یا تلگرام، قیمت و موجودی را بپرسید."],
    ["badgeCheck", "تأیید سفارش", "قیمت روز، موجودی و شرایط تأمین تأیید می‌شود."],
    ["truck", "تحویل سریع", "سفارش مطمئن و سریع به دستتان می‌رسد."],
  ] },
  ru: { tag: "КАК ЭТО РАБОТАЕТ", title: "Заказ в четыре простых шага", steps: [
    ["search", "Просмотр каталога", "Изучайте и фильтруйте тысячи медицинских товаров."],
    ["chat", "Отправьте запрос", "Уточните цену и наличие в WhatsApp или Telegram."],
    ["badgeCheck", "Подтверждение заказа", "Актуальная цена, наличие и условия поставки."],
    ["truck", "Быстрая доставка", "Заказ доставляется быстро и надёжно."],
  ] },
  tg: { tag: "ЧӢ ТАВР КОР МЕКУНЕМ", title: "Харид дар чор қадами оддӣ", steps: [
    ["search", "Аз каталог дидан", "Ҳазорон моли тиббиро бубинед ва филтр кунед."],
    ["chat", "Дархост фиристед", "Дар WhatsApp ё Telegram нарх ва мавҷудиро пурсед."],
    ["badgeCheck", "Тасдиқи фармоиш", "Нархи рӯз, мавҷудӣ ва шартҳои таҳвил тасдиқ мешавад."],
    ["truck", "Расондани зуд", "Фармоиши шумо зуд ва боэътимод мерасад."],
  ] },
  en: { tag: "HOW IT WORKS", title: "Ordering in four simple steps", steps: [
    ["search", "Browse the catalog", "Explore and filter thousands of medical supplies."],
    ["chat", "Send an inquiry", "Ask price and availability on WhatsApp or Telegram."],
    ["badgeCheck", "Confirm your order", "Live price, stock and supply terms are confirmed."],
    ["truck", "Fast delivery", "Your order is delivered quickly and reliably."],
  ] },
};

export default function ScrollyHowItWorks({ lang }) {
  const c = COPY[lang] || COPY.en;
  const n = c.steps.length;
  const ref = useRef(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  useEffect(() => {
    const unsub = scrollYProgress.on("change", (v) => {
      setActive(Math.min(n - 1, Math.max(0, Math.floor(v * n))));
    });
    return () => unsub();
  }, [scrollYProgress, n]);

  return (
    <section ref={ref} className="relative bg-canvas" style={{ height: `${n * 75}vh` }}>
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        <div className="container-x w-full grid lg:grid-cols-2 gap-10 items-center">
          {/* steps */}
          <div>
            <div className="section-tag mb-3">{c.tag}</div>
            <h2 className="section-h-lg mb-8">{c.title}</h2>
            <div className="space-y-3">
              {c.steps.map(([icon, title, desc], i) => {
                const on = i === active;
                return (
                  <div key={i} className={`flex gap-4 rounded-2xl p-4 transition-all duration-300 ${on ? "bg-surface border border-line shadow-soft scale-[1.01]" : "opacity-45"}`}>
                    <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 transition-colors ${on ? "bg-brand-gradient text-white shadow-brand" : "bg-brand-violet/10 text-brand-violet"}`}>
                      <Icon name={icon} size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-brand-violet tabular">{String(i + 1).padStart(2, "0")}</span>
                        <h3 className="font-display font-bold text-ink">{title}</h3>
                      </div>
                      <p className="text-[13px] text-ink-muted mt-1 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* animated graphic */}
          <div className="hidden lg:flex items-center justify-center">
            <div className="relative w-full max-w-sm aspect-square rounded-[2rem] gradient-border grid place-items-center overflow-hidden">
              <div className="blob w-[60%] h-[60%] animate-aurora" style={{ background: "radial-gradient(circle, rgba(139,47,247,0.25), transparent 70%)" }} />
              {c.steps.map(([icon], i) => (
                <motion.div key={i} className="absolute" initial={false}
                  animate={{ opacity: i === active ? 1 : 0, scale: i === active ? 1 : 0.7 }}
                  transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
                  <div className="w-28 h-28 rounded-3xl bg-brand-gradient text-white grid place-items-center shadow-brand">
                    <Icon name={icon} size={52} strokeWidth={1.4} />
                  </div>
                </motion.div>
              ))}
              <div className="absolute bottom-5 flex gap-2">
                {c.steps.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-6 bg-brand-violet" : "w-1.5 bg-line"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
