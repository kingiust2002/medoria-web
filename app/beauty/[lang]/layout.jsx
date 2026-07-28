// app/beauty/[lang]/layout.jsx — Medoria Beauty shell. Mirrors the Health
// layout chrome (header, main, footer, floating WhatsApp) with the beauty
// reskin scope (data-vertical) + a self-hosted Playfair Display serif (latin +
// cyrillic, via next/font — no external Google Fonts request at runtime, no
// font-swap flash, only loaded on beauty routes).
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { LOCALES, LANG_META } from "@/lib/i18n";
import { getBeautyNavTree } from "@/lib/beauty/catalog";
import BeautyHeader from "@/components/beauty/BeautyHeader";
import BeautyFooter from "@/components/beauty/BeautyFooter";
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp";
import BeautyAiAssistant from "@/components/beauty/BeautyAiAssistant";

// Beauty's own mark — overrides the root's neutral fused favicon. Tight-
// cropped to the glyph (the source PNG carries generous transparent
// padding, which read as a faint, tiny icon at real favicon size).
export async function generateMetadata(props) {
  const params = await props.params;
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  return { icons: { icon: { url: "/brand/beauty-mark-icon.webp", type: "image/webp" }, apple: { url: "/brand/beauty-mark-icon.webp", type: "image/webp" } } };
}

// Exposes --font-beauty (consumed by tailwind.config.js `font-beauty` and the
// [data-vertical="beauty"] .font-display / .section-h-lg rules in globals.css).
const playfairDisplay = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-beauty",
  display: "swap",
});

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// ISR: the header mega-menu reads the live category tree; refresh every 2 min
// (panel edits also revalidate beauty paths on save for near-instant updates).
export const revalidate = 120;

// The nav's category tree, resolved in its own Suspense boundary. Keeping this
// out of the layout body is what lets the rest of the shell — crucially
// `children`, and therefore each page's loading.jsx — stream immediately. When
// the layout itself awaited this, React could not flush ANY of the shell until
// the tree resolved, so the World page's skeleton never actually got to show
// and the browser sat on a blank document for the whole round trip.
// The fallback renders the real header with an empty tree: BeautyMegaMenu
// degrades to a plain link to /worlds and the mobile drawer hides its
// accordion, so the header is complete and usable from the first paint and
// only the mega-menu contents arrive a beat later.
async function BeautyNav({ lang }) {
  // Slim projection: the nav is a client component in this shared layout, so
  // its props are serialised into every Beauty page's HTML for hydration.
  const categoryTree = await getBeautyNavTree(lang);
  return <BeautyHeader lang={lang} categoryTree={categoryTree} />;
}

export default async function BeautyLayout(props) {
  const params = await props.params;

  const {
    children
  } = props;

  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const dir = LANG_META[lang].dir;
  return (
    <div
      lang={lang}
      dir={dir}
      data-vertical="beauty"
      className={`v-scope ${playfairDisplay.variable} ${dir === "rtl" ? "font-farsi" : "font-sans"}`}
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${lang}";document.documentElement.dir="${dir}";`,
        }}
      />
      <Suspense fallback={<BeautyHeader lang={lang} categoryTree={[]} />}>
        <BeautyNav lang={lang} />
      </Suspense>
      <main>{children}</main>
      <BeautyFooter lang={lang} />
      <FloatingWhatsApp lang={lang} />
      <BeautyAiAssistant lang={lang} />
    </div>
  );
}
