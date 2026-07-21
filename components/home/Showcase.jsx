// components/home/Showcase.jsx — bento gallery of image slots (drop real photos in later)
import { getTranslations } from "@/lib/i18n";
import ImagePlaceholder from "@/components/shared/ImagePlaceholder";
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";

const LABELS = {
  fa: {
    tag: "مدوریا در عمل",
    title: "ساخته‌شده حول افرادی که پشت مراقبت هستند",
    sub: "کاتالوگی حرفه‌ای که اطلاعات محصول، نیازهای خرید و پشتیبانی مستقیم را در یک تجربه شفاف گرد می‌آورد.",
    tiles: ["ملزومات بالینی", "اطلاعات شفاف محصول", "استعلام‌های هماهنگ", "پشتیبانی انسانی"],
    stat: "تحویل در سراسر تاجیکستان",
  },
  ru: {
    tag: "MEDORIA НА ПРАКТИКЕ",
    title: "Всё вокруг людей, стоящих за заботой о здоровье",
    sub: "Профессиональный каталог, который объединяет информацию о товарах, потребности закупки и прямую поддержку в одном понятном опыте.",
    tiles: ["Клинические расходники", "Понятная информация о товаре", "Согласованные запросы", "Человеческая поддержка"],
    stat: "Доставка по Таджикистану",
  },
  tg: {
    tag: "MEDORIA ДАР АМАЛ",
    title: "Дар атрофи одамони пушти нигоҳубини тандурустӣ сохта шуда",
    sub: "Каталоги касбие, ки маълумоти мол, ниёзҳои харид ва дастгирии мустақимро дар як таҷрибаи равшан муттаҳид мекунад.",
    tiles: ["Маводи клиникӣ", "Маълумоти равшани мол", "Дархостҳои мутаносиб", "Дастгирии инсонӣ"],
    stat: "Расондан дар Тоҷикистон",
  },
  en: {
    tag: "MEDORIA IN PRACTICE",
    title: "Built around the people behind care",
    sub: "A professional catalog designed to bring product information, purchasing requirements and direct support into one clear experience.",
    tiles: ["Clinical essentials", "Clear product information", "Coordinated inquiries", "Human support"],
    stat: "Delivery across Tajikistan",
  },
};

const TILE_ICONS = ["package", "shield", "chat", "handshake"];

export default function Showcase({ lang }) {
  const L = LABELS[lang] || LABELS.en;

  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
          <div className="eyebrow mb-4 mx-auto"><span className="gradient-text">{L.tag}</span></div>
          <h2 className="section-h-lg">{L.title}</h2>
          <p className="section-sub mx-auto">{L.sub}</p>
        </Reveal>

        {/* Uniform gallery — identical square tiles so every photo crops the same way.
            aspect-square lives on the ImagePlaceholder root (a normal-flow block),
            not on the grid item, so the row can never collapse. */}
        <Reveal delay={0.1} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Warehouse (carries the delivery stat chip) */}
          <div className="relative">
            <ImagePlaceholder src="/images/showcase-warehouse-light.webp" srcDark="/images/showcase-warehouse-dark.webp" alt={L.tiles[0]} icon={TILE_ICONS[0]} label={L.tiles[0]} className="aspect-square w-full" rounded="rounded-3xl" />
            <div className="absolute bottom-3 start-3 glass rounded-2xl px-3.5 py-2 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-brand">
                <Icon name="truck" size={16} />
              </span>
              <span className="text-[11px] font-bold text-ink leading-tight">{L.stat}</span>
            </div>
          </div>

          <div className="relative">
            <ImagePlaceholder src="/images/showcase-products-light.webp" srcDark="/images/showcase-products-dark.webp" alt={L.tiles[1]} icon={TILE_ICONS[1]} label={L.tiles[1]} className="aspect-square w-full" rounded="rounded-3xl" />
          </div>
          <div className="relative">
            <ImagePlaceholder src="/images/showcase-qc-light.webp" srcDark="/images/showcase-qc-dark.webp" alt={L.tiles[2]} icon={TILE_ICONS[2]} label={L.tiles[2]} className="aspect-square w-full" rounded="rounded-3xl" />
          </div>
          <div className="relative">
            <ImagePlaceholder src="/images/showcase-team-light.webp" srcDark="/images/showcase-team-dark.webp" alt={L.tiles[3]} icon={TILE_ICONS[3]} label={L.tiles[3]} className="aspect-square w-full" rounded="rounded-3xl" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
