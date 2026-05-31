// components/home/Trust.jsx
import { getTranslations } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";

const TESTIMONIALS = {
  ru: [
    { text: "Быстрая доставка и прозрачные цены. Работаем уже более года, ни одной претензии.", author: "Анвар Х.", role: "Заведующий аптекой, Душанбе" },
    { text: "Качественные расходники, всё сертифицировано. Связь через WhatsApp удобна и оперативна.", author: "Др. Сафия Р.", role: "Главврач клиники" },
    { text: "Цены лучше, чем у местных дистрибьюторов. Регулярные крупные заказы — без задержек.", author: "Фаррух М.", role: "Закупщик, больница" },
  ],
  tg: [
    { text: "Расондан зуд ва нархҳои шаффоф. Зиёда аз як сол кор мекунем, ҳеҷ шикоят нест.", author: "Анвар Х.", role: "Сардори дорухона, Душанбе" },
    { text: "Маводи босифат, ҳама сертификатнок. Алоқа тавассути WhatsApp қулай аст.", author: "Д-р. Сафия Р.", role: "Сардухтари клиника" },
    { text: "Нархҳо аз дистрибьюторҳои маҳаллӣ беҳтаранд. Фармоишҳои калон бе таъхир.", author: "Фаррух М.", role: "Харидор, беморхона" },
  ],
  en: [
    { text: "Fast delivery and transparent pricing. We've worked with them for over a year — zero complaints.", author: "Anvar K.", role: "Pharmacy Manager, Dushanbe" },
    { text: "Quality consumables, all certified. WhatsApp communication is convenient and prompt.", author: "Dr. Safiya R.", role: "Chief Physician, Clinic" },
    { text: "Better prices than local distributors. Regular bulk orders — never delayed.", author: "Farrukh M.", role: "Procurement, Hospital" },
  ],
  fa: [
    { text: "تحویل سریع و قیمت‌گذاری شفاف. بیش از یک سال است که با آن‌ها کار می‌کنیم — هیچ شکایتی نداریم.", author: "انور خ.", role: "مدیر داروخانه، دوشنبه" },
    { text: "کالاهای باکیفیت، همگی دارای گواهی. ارتباط از طریق واتساپ راحت و سریع است.", author: "دکتر صفیه ر.", role: "پزشک ارشد کلینیک" },
    { text: "قیمت‌ها بهتر از توزیع‌کنندگان محلی است. سفارشات بزرگ منظم — هرگز با تأخیر مواجه نشده‌ایم.", author: "فرخ م.", role: "خریدار، بیمارستان" },
  ],
};

const TRUST_LABELS = {
  ru: { tag: "ДОВЕРИЕ КЛИЕНТОВ", title: "Что говорят наши клиенты" },
  tg: { tag: "БОВАРИИ МУШТАРИЁН", title: "Муштариён чӣ мегӯянд" },
  en: { tag: "CLIENT TRUST", title: "What our clients say" },
  fa: { tag: "اعتماد مشتریان", title: "مشتریان ما چه می‌گویند" },
};

export default function Trust({ lang }) {
  const t = getTranslations(lang);
  const items = TESTIMONIALS[lang] || TESTIMONIALS.en;
  const labels = TRUST_LABELS[lang] || TRUST_LABELS.en;

  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
          <div className="section-tag mb-3">{labels.tag}</div>
          <h2 className="section-h">{labels.title}</h2>
        </Reveal>

        <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {items.map((item, i) => (
            <StaggerItem key={i} className="h-full">
            <div className="relative card card-hover p-6 overflow-hidden h-full">
              <Icon name="quote" size={56} className="absolute -top-2 end-3 text-brand-violet/[0.06]" fill="currentColor" strokeWidth={0} />
              {/* 5 stars */}
              <div className="relative flex gap-0.5 mb-4 text-accent-gold">
                {[1,2,3,4,5].map((s) => (
                  <Icon key={s} name="star" size={14} fill="currentColor" strokeWidth={0} />
                ))}
              </div>

              <p className="relative text-[14px] text-ink leading-relaxed mb-5">
                "{item.text}"
              </p>

              <div className="flex items-center gap-3 pt-4 border-t border-line">
                <div className="w-10 h-10 rounded-full bg-brand-gradient text-white flex items-center justify-center font-bold text-sm">
                  {item.author.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[13px] text-ink truncate">{item.author}</div>
                  <div className="text-[11px] text-ink-faint truncate">{item.role}</div>
                </div>
              </div>
            </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
