// components/home/Showcase.jsx — bento gallery of image slots (drop real photos in later)
import { getTranslations } from "@/lib/i18n";
import ImagePlaceholder from "@/components/shared/ImagePlaceholder";
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";

const LABELS = {
  fa: {
    tag: "نگاهی به مدوریا",
    title: "از انبار تا درِ کلینیک شما",
    sub: "تصاویر واقعی انبار، محصولات و تیم ما به‌زودی اینجا قرار می‌گیرد — جای هر عکس آماده است.",
    tiles: ["انبار و لجستیک", "محصولات اصل", "کنترل کیفیت", "تیم فروش و پشتیبانی"],
    stat: "تحویل در سراسر تاجیکستان",
  },
  ru: {
    tag: "ЗНАКОМЬТЕСЬ — MEDORIA",
    title: "От склада до дверей вашей клиники",
    sub: "Здесь скоро появятся реальные фото склада, товаров и команды — место под каждое фото уже готово.",
    tiles: ["Склад и логистика", "Оригинальные товары", "Контроль качества", "Отдел продаж"],
    stat: "Доставка по Таджикистану",
  },
  tg: {
    tag: "ШИНОСОӢ — MEDORIA",
    title: "Аз анбор то дари клиникаи шумо",
    sub: "Дар ин ҷо ба зудӣ расмҳои воқеии анбор, маҳсулот ва даста ҷойгир мешаванд.",
    tiles: ["Анбор ва логистика", "Маҳсулоти аслӣ", "Назорати сифат", "Дастаи фурӯш"],
    stat: "Расондан дар Тоҷикистон",
  },
  en: {
    tag: "MEET MEDORIA",
    title: "From our warehouse to your clinic's door",
    sub: "Real photos of our facility, products and team will live here — every image slot is ready.",
    tiles: ["Warehouse & logistics", "Original products", "Quality control", "Sales & support team"],
    stat: "Delivery across Tajikistan",
  },
};

const TILE_ICONS = ["truck", "package", "shieldPlus", "handshake"];

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
