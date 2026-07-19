// components/home/Certifications.jsx — trust / standards band.
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";

// Reframed from certification/authenticity claims to a considered
// information approach — no "genuine", "verified", inspection or replacement
// promises (§5.5 of the copy deck). Same 4-card layout.
const COPY = {
  fa: { tag: "رویکردی سنجیده", title: "اطلاعات محصول، پیش از وعده",
    items: [["sparkles", "گزینش متمرکز", "کاتالوگی متمرکز برای کشف حرفه‌ای."], ["eye", "زمینه‌ی روشن", "اطلاعات محصول و دسته با ظرافت و بدون شلوغی."], ["badgeCheck", "تأیید موجودی", "گزینه‌های روز هنگام استعلام تأیید می‌شود."], ["chat", "گفت‌وگوی حرفه‌ای", "پرسش‌ها و جزئیات تجاری مستقیم بررسی می‌شود."]] },
  ru: { tag: "ВЗВЕШЕННЫЙ ПОДХОД", title: "Информация о товаре, а не обещания",
    items: [["sparkles", "Отобранный ассортимент", "Сфокусированный каталог для профессионального выбора."], ["eye", "Ясный контекст", "Информация о товаре и категории — сдержанно, без лишнего."], ["badgeCheck", "Наличие подтверждается", "Актуальные варианты подтверждаются при запросе."], ["chat", "Профессиональный диалог", "Вопросы и коммерческие детали обсуждаются напрямую."]] },
  tg: { tag: "РАВИШИ СНЖИДА", title: "Маълумоти маҳсулот, на ваъда",
    items: [["sparkles", "Интихоби мутамарказ", "Каталоги мутамарказ барои кашфи касбӣ."], ["eye", "Заминаи равшан", "Маълумоти маҳсулот ва самт — бо назокат, бе изофагӣ."], ["badgeCheck", "Тасдиқи мавҷудӣ", "Имконоти ҷорӣ ҳангоми дархост тасдиқ мешавад."], ["chat", "Гуфтугӯи касбӣ", "Саволҳо ва тафсилоти тиҷоратӣ мустақим муҳокима мешаванд."]] },
  en: { tag: "A CONSIDERED APPROACH", title: "Product information before promises",
    items: [["sparkles", "Selected range", "A focused catalog built for professional discovery."], ["eye", "Clear context", "Product and category information presented with restraint."], ["badgeCheck", "Availability confirmed", "Current options are confirmed when you inquire."], ["chat", "Professional conversation", "Questions and commercial details are discussed directly."]] },
};

export default function Certifications({ lang }) {
  const c = COPY[lang] || COPY.en;
  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="text-center mb-10 max-w-2xl mx-auto">
          <div className="section-tag mb-3">{c.tag}</div>
          <h2 className="section-h">{c.title}</h2>
        </Reveal>
        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {c.items.map(([icon, title, desc], i) => (
            <StaggerItem key={i}>
              <TiltCard className="h-full rounded-2xl" max={6}>
                <div className="card card-hover p-6 text-center h-full group">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-violet/[0.08] text-brand-violet grid place-items-center mb-4 group-hover:bg-brand-gradient group-hover:text-white transition-colors">
                    <Icon name={icon} size={26} strokeWidth={1.7} />
                  </div>
                  <h3 className="font-display font-bold text-[15px] text-ink mb-1.5">{title}</h3>
                  <p className="text-[12px] text-ink-muted leading-relaxed">{desc}</p>
                </div>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
