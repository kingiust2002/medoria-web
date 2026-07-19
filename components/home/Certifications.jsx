// components/home/Certifications.jsx — trust / standards band.
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";

// Reframed from certification claims to information quality — no ISO/CE,
// inspection, "genuine" or replacement promises (nothing implied without
// evidence). Same 4-card layout, defensible copy.
const COPY = {
  fa: { tag: "اطلاعات محصول", title: "شفافیت در هر مرحله از استعلام",
    items: [["shield", "جزئیات کاربردی", "اطلاعات و مشخصات محصول را در جایی که ارائه شده مرور کنید."], ["badgeCheck", "تأیید موجودی", "موجودی روز هنگام استعلام تأیید می‌شود."], ["invoice", "مستندات در صورت درخواست", "بپرسید کدام مدارک محصول برای بررسی موجود است."], ["check", "تأیید سفارش", "تعداد، شرایط و مراحل بعدی پیش از انجام توافق می‌شود."]] },
  ru: { tag: "ИНФОРМАЦИЯ О ТОВАРЕ", title: "Ясность на каждом этапе запроса",
    items: [["shield", "Полезные детали", "Ознакомьтесь с информацией и характеристиками товара, где они доступны."], ["badgeCheck", "Наличие подтверждается", "Актуальное наличие подтверждается при запросе."], ["invoice", "Документы по запросу", "Уточните у команды, какие документы на товар доступны для ознакомления."], ["check", "Подтверждение заказа", "Количество, условия и следующие шаги согласуются до выполнения."]] },
  tg: { tag: "МАЪЛУМОТИ МАҲСУЛОТ", title: "Равшанӣ дар ҳар марҳилаи дархост",
    items: [["shield", "Тафсилоти муфид", "Маълумот ва хусусиятҳои маҳсулотро дар ҷойе ки мавҷуд аст, бинед."], ["badgeCheck", "Тасдиқи мавҷудӣ", "Мавҷудии ҷорӣ ҳангоми дархост тасдиқ мешавад."], ["invoice", "Ҳуҷҷатҳо бо дархост", "Аз даста пурсед, ки кадом ҳуҷҷатҳои маҳсулот барои баррасӣ мавҷуданд."], ["check", "Тасдиқи фармоиш", "Миқдор, шартҳо ва қадамҳои баъдӣ пеш аз иҷро мувофиқа мешаванд."]] },
  en: { tag: "PRODUCT INFORMATION", title: "Clarity at every step of the inquiry",
    items: [["shield", "Useful details", "Review product information and specifications where provided."], ["badgeCheck", "Availability confirmed", "Current availability is confirmed when you inquire."], ["invoice", "Documentation on request", "Ask the team which product documents are available for review."], ["check", "Order confirmation", "Quantities, terms and next steps are agreed before fulfilment."]] },
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
