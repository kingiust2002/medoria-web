// components/home/Certifications.jsx — trust / standards band.
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";

const COPY = {
  fa: { tag: "کیفیت و اصالت", title: "تأمین مطابق استانداردهای کیفیت",
    items: [["shield", "کنترل کیفیت", "بازبینی هر محموله پیش از ارسال"], ["badgeCheck", "کالای اصل", "تنها از تأمین‌کنندگان معتبر"], ["award", "استانداردهای بین‌المللی", "هم‌راستا با الزامات کیفیت"], ["shieldPlus", "ضمانت", "تعویض در صورت مغایرت"]] },
  ru: { tag: "КАЧЕСТВО И ПОДЛИННОСТЬ", title: "Поставки по стандартам качества",
    items: [["shield", "Контроль качества", "Проверка каждой партии перед отправкой"], ["badgeCheck", "Оригинальная продукция", "Только проверенные поставщики"], ["award", "Международные стандарты", "Соответствие требованиям качества"], ["shieldPlus", "Гарантия", "Замена при несоответствии"]] },
  tg: { tag: "СИФАТ ВА АСЛӢ", title: "Таъминот мутобиқи стандартҳои сифат",
    items: [["shield", "Назорати сифат", "Тафтиши ҳар маҳмула пеш аз фиристодан"], ["badgeCheck", "Маҳсулоти аслӣ", "Танҳо аз таъминкунандагони боэътимод"], ["award", "Стандартҳои байналмилалӣ", "Мутобиқи талаботи сифат"], ["shieldPlus", "Кафолат", "Иваз дар сурати номутобиқатӣ"]] },
  en: { tag: "QUALITY & AUTHENTICITY", title: "Supplied to recognised quality standards",
    items: [["shield", "Quality control", "Every shipment inspected before dispatch"], ["badgeCheck", "Genuine products", "Only from verified suppliers"], ["award", "International standards", "Aligned with quality requirements"], ["shieldPlus", "Assurance", "Replacement on any discrepancy"]] },
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
