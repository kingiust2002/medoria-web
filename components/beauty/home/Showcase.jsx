// components/home/Showcase.jsx — bento gallery of image slots (drop real photos in later)
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import ImagePlaceholder from "@/components/shared/ImagePlaceholder";
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";

const LABELS = {
  fa: {
    tag: "درون منتخب مدوریا",
    title: "زبانی بصری برای زیبایی حرفه‌ای مدرن",
    sub: "مراقبت پوست، رنگ‌آرایی و ابزار حرفه‌ای با نگاهی آرام‌تر و سنجیده‌تر ارائه شده‌اند.",
    tiles: ["منتخب مراقبت پوست", "رنگ و فرم صورت", "ابزار حرفه‌ای", "نگاه مدوریا"],
    stat: "ساخته‌شده برای متخصصان زیبایی",
  },
  ru: {
    tag: "ВНУТРИ ОТБОРА MEDORIA",
    title: "Визуальный язык современной профессиональной красоты",
    sub: "Уход, колористика и профессиональные инструменты — представлены с более тихой, продуманной точки зрения.",
    tiles: ["Отбор ухода", "Цвет и колористика", "Профессиональные инструменты", "Точка зрения Medoria"],
    stat: "Создано для бьюти-профессионалов",
  },
  tg: {
    tag: "ДАРУНИ ИНТИХОБИ MEDORIA",
    title: "Забони визуалии зебоии касбии муосир",
    sub: "Нигоҳубин, ранг ва абзорҳои касбӣ бо нигоҳи ором ва андешидашуда пешниҳод мешаванд.",
    tiles: ["Интихоби нигоҳубин", "Ранг ва тарҳи рӯй", "Абзорҳои касбӣ", "Нигоҳи Medoria"],
    stat: "Барои мутахассисони зебоӣ сохта шуда",
  },
  en: {
    tag: "INSIDE THE MEDORIA EDIT",
    title: "A visual language for modern professional beauty",
    sub: "Skincare, artistry and professional tools presented with a quieter, more considered point of view.",
    tiles: ["The skincare edit", "Colour & complexion", "Professional tools", "The Medoria point of view"],
    stat: "Created for beauty professionals",
  },
};

const TILE_ICONS = ["sparkles", "star", "package", "eye"];

export default function Showcase({ lang }) {
  const L = LABELS[lang] || LABELS.en;

  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
          <div className="eyebrow mb-4 mx-auto" data-fil-node><span className="gradient-text">{L.tag}</span></div>
          <h2 className="section-h-lg">{L.title}</h2>
          <p className="section-sub mx-auto">{L.sub}</p>
        </Reveal>

        {/* Uniform gallery — identical square tiles so every photo crops the same way.
            aspect-square lives on the ImagePlaceholder root (a normal-flow block),
            not on the grid item, so the row can never collapse. */}
        <Reveal delay={0.1} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {/* Skincare edit (carries the "created for beauty professionals" stat chip) */}
          <div className="relative">
            <ImagePlaceholder src="/beauty/showcase/showcase-01.webp" alt={L.tiles[0]} icon={TILE_ICONS[0]} label={L.tiles[0]} className="aspect-square w-full" rounded="rounded-3xl" />
            <div className="absolute bottom-3 start-3 glass rounded-2xl px-3.5 py-2 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-brand">
                <Icon name="sparkles" size={16} />
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
