// components/home/Trust.jsx
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";

const TESTIMONIALS = {
  ru: [
    { text: "Каждый продукт мы отбираем так, как выбирали бы для собственного салона.", author: "Medoria Beauty", role: "Наше обещание · отбор" },
    { text: "Оригинальность и качество — не опция, а условие попадания в коллекцию.", author: "Medoria Beauty", role: "Наше обещание · качество" },
    { text: "Партнёрам — прозрачные условия, образцы и поддержка на каждом шаге.", author: "Medoria Beauty", role: "Наше обещание · сервис" },
  ],
  tg: [
    { text: "Ҳар маҳсулотро тавре интихоб мекунем, ки барои салони худамон интихоб мекардем.", author: "Medoria Beauty", role: "Ваъдаи мо · интихоб" },
    { text: "Аслӣ будан ва сифат — на имкон, балки шарти ворид шудан ба коллексия.", author: "Medoria Beauty", role: "Ваъдаи мо · сифат" },
    { text: "Ба шарикон — шартҳои шаффоф, намунаҳо ва дастгирӣ дар ҳар қадам.", author: "Medoria Beauty", role: "Ваъдаи мо · хизмат" },
  ],
  en: [
    { text: "We select every product the way we would for our own salon.", author: "Medoria Beauty", role: "Our promise · curation" },
    { text: "Authenticity and quality are not options — they are the condition of entry.", author: "Medoria Beauty", role: "Our promise · quality" },
    { text: "Partners get transparent terms, samples and support at every step.", author: "Medoria Beauty", role: "Our promise · service" },
  ],
  fa: [
    { text: "هر محصول را طوری انتخاب می‌کنیم که برای سالن خودمان انتخاب می‌کردیم.", author: "مدوریا بیوتی", role: "وعده ما · انتخاب" },
    { text: "اصالت و کیفیت شرط ورود به کالکشن است، نه یک گزینه.", author: "مدوریا بیوتی", role: "وعده ما · کیفیت" },
    { text: "برای شرکا: شرایط شفاف، نمونه و پشتیبانی در هر قدم.", author: "مدوریا بیوتی", role: "وعده ما · خدمات" },
  ],
};

const TRUST_LABELS = {
  ru: { tag: "НАШИ ОБЕЩАНИЯ", title: "На чём стоит Medoria Beauty" },
  tg: { tag: "ВАЪДАҲОИ МО", title: "Medoria Beauty бар чӣ устувор аст" },
  en: { tag: "OUR PROMISES", title: "What Medoria Beauty stands on" },
  fa: { tag: "وعده‌های ما", title: "مدوریا بیوتی بر چه استوار است" },
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
