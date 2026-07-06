// components/home/Showcase.jsx — bento gallery of image slots (drop real photos in later)
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import ImagePlaceholder from "@/components/shared/ImagePlaceholder";
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";

const LABELS = {
  fa: {
    tag: "آشنایی — مدوریا بیوتی",
    title: "از ویترین تا سالن شما",
    sub: "به‌زودی عکس‌های واقعی کالکشن، بسته‌بندی و ویترین ما اینجا قرار می‌گیرد — جای هر عکس آماده است.",
    tiles: ["ویترین لوکس", "محصولات اصل", "بسته‌بندی زیبا", "تیم ما"],
    stat: "ارسال در سراسر تاجیکستان",
  },
  ru: {
    tag: "ЗНАКОМЬТЕСЬ — MEDORIA BEAUTY",
    title: "От витрины до вашего салона",
    sub: "Здесь скоро появятся реальные фото коллекции, упаковки и витрины — место под каждое фото уже готово.",
    tiles: ["Люксовая витрина", "Оригинальные товары", "Красивая упаковка", "Наша команда"],
    stat: "Доставка по Таджикистану",
  },
  tg: {
    tag: "ШИНОСОӢ — MEDORIA BEAUTY",
    title: "Аз витрина то салони шумо",
    sub: "Дар ин ҷо ба зудӣ расмҳои воқеии коллексия, бастабандӣ ва витрина ҷойгир мешаванд.",
    tiles: ["Витринаи люкс", "Маҳсулоти аслӣ", "Бастабандии зебо", "Дастаи мо"],
    stat: "Расондан дар Тоҷикистон",
  },
  en: {
    tag: "MEET MEDORIA BEAUTY",
    title: "From our display to your salon",
    sub: "Real photos of the collection, packaging and display will live here — every image slot is ready.",
    tiles: ["Luxe display", "Original products", "Beautiful packaging", "Our team"],
    stat: "Delivery across Tajikistan",
  },
};

const TILE_ICONS = ["sparkles", "package", "award", "handshake"];

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
            <ImagePlaceholder src="/beauty/showcase/showcase-01.webp" alt={L.tiles[0]} icon={TILE_ICONS[0]} label={L.tiles[0]} className="aspect-square w-full" rounded="rounded-3xl" />
            <div className="absolute bottom-3 start-3 glass rounded-2xl px-3.5 py-2 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-brand">
                <Icon name="truck" size={16} />
              </span>
              <span className="text-[11px] font-bold text-ink leading-tight">{L.stat}</span>
            </div>
          </div>

          <div className="relative">
            <ImagePlaceholder src="/beauty/showcase/showcase-02.webp" alt={L.tiles[1]} icon={TILE_ICONS[1]} label={L.tiles[1]} className="aspect-square w-full" rounded="rounded-3xl" />
          </div>
          <div className="relative">
            <ImagePlaceholder src="/beauty/showcase/showcase-03.webp" alt={L.tiles[2]} icon={TILE_ICONS[2]} label={L.tiles[2]} className="aspect-square w-full" rounded="rounded-3xl" />
          </div>
          <div className="relative">
            <ImagePlaceholder src="/beauty/showcase/showcase-04.webp" alt={L.tiles[3]} icon={TILE_ICONS[3]} label={L.tiles[3]} className="aspect-square w-full" rounded="rounded-3xl" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
