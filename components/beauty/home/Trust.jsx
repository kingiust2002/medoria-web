// components/beauty/home/Trust.jsx — the brand promises as editorial
// pull-quotes («Fil d'Or» season). Redesigned away from the star-rating
// review-card form: these are Medoria's own promises, not customer reviews,
// so they read as serif pull-quotes with a copper rule — never as
// testimonials (brand truth law: nothing may imitate fake reviews).
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";

const PROMISES = {
  ru: [
    { text: "Каждый продукт мы отбираем так, как выбирали бы для собственного салона.", role: "Наше обещание · отбор" },
    { text: "Оригинальность и качество — не опция, а условие попадания в коллекцию.", role: "Наше обещание · качество" },
    { text: "Партнёрам — прозрачные условия, образцы и поддержка на каждом шаге.", role: "Наше обещание · сервис" },
  ],
  tg: [
    { text: "Ҳар маҳсулотро тавре интихоб мекунем, ки барои салони худамон интихоб мекардем.", role: "Ваъдаи мо · интихоб" },
    { text: "Аслӣ будан ва сифат — на имкон, балки шарти ворид шудан ба коллексия.", role: "Ваъдаи мо · сифат" },
    { text: "Ба шарикон — шартҳои шаффоф, намунаҳо ва дастгирӣ дар ҳар қадам.", role: "Ваъдаи мо · хизмат" },
  ],
  en: [
    { text: "We select every product the way we would for our own salon.", role: "Our promise · curation" },
    { text: "Authenticity and quality are not options — they are the condition of entry.", role: "Our promise · quality" },
    { text: "Partners get transparent terms, samples and support at every step.", role: "Our promise · service" },
  ],
  fa: [
    { text: "هر محصول را طوری انتخاب می‌کنیم که برای سالن خودمان انتخاب می‌کردیم.", role: "وعده ما · انتخاب" },
    { text: "اصالت و کیفیت شرط ورود به کالکشن است، نه یک گزینه.", role: "وعده ما · کیفیت" },
    { text: "برای شرکا: شرایط شفاف، نمونه و پشتیبانی در هر قدم.", role: "وعده ما · خدمات" },
  ],
};

const TRUST_LABELS = {
  ru: { tag: "НАШИ ОБЕЩАНИЯ", title: "На чём стоит Medoria Beauty" },
  tg: { tag: "ВАЪДАҲОИ МО", title: "Medoria Beauty бар чӣ устувор аст" },
  en: { tag: "OUR PROMISES", title: "What Medoria Beauty stands on" },
  fa: { tag: "وعده‌های ما", title: "مدوریا بیوتی بر چه استوار است" },
};

export default function Trust({ lang }) {
  const items = PROMISES[lang] || PROMISES.en;
  const labels = TRUST_LABELS[lang] || TRUST_LABELS.en;

  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-14 max-w-2xl mx-auto">
          <div className="section-tag mb-3">{labels.tag}</div>
          <h2 className="section-h">{labels.title}</h2>
        </Reveal>

        <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-10">
          {items.map((item, i) => (
            <StaggerItem key={i} className="h-full">
              <figure className="relative h-full flex flex-col m-0 pt-2">
                <span
                  aria-hidden="true"
                  className="bv-display block select-none leading-none text-[64px] text-[color:var(--v-copper)] opacity-40 mb-1"
                >
                  &ldquo;
                </span>
                <blockquote className="m-0 flex-1 font-display text-[19px] md:text-[21px] leading-[1.6] text-ink">
                  {item.text}
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span className="h-px w-8 shrink-0" style={{ background: "var(--v-copper)" }} />
                  <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-faint">
                    {item.role}
                  </span>
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
