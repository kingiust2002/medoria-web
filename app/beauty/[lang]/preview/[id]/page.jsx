// app/beauty/[lang]/preview/[id]/page.jsx — the PRIVATE preview of a Beauty product on the real public page (N5). Same rules as Health's:
// no session / no right / another house → a plain 404; rendered per request; noindex / no-store; no view recorded, no request sent.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getSession } from "@/lib/beauty/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { loadPreview } from "@/lib/operator/previewLoad";
import { getRelatedBeautyProducts, getBeautyCategories } from "@/lib/beauty/catalog";
import { PreviewProvider } from "@/components/shared/PreviewContext";
import PreviewBanner from "@/components/operator/PreviewBanner";
import BeautyProductView from "@/components/beauty/BeautyProductView";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export function generateMetadata() {
  return { title: "Preview", robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true, noimageindex: true } };
}

export default async function BeautyPreviewPage(props) {
  const { lang, id } = await props.params;
  const sp = await props.searchParams;
  if (!LOCALES.includes(lang)) notFound();
  const res = await loadPreview({ house: "beauty", session: await getSession(), admin: getAdminClient(), id, token: typeof sp?.token === "string" ? sp.token : null, requestId: typeof sp?.request === "string" ? sp.request : null });
  if (res.state !== "ok") notFound();
  const [related, cats] = await Promise.all([getRelatedBeautyProducts(res.product, 4), getBeautyCategories()]);
  return (
    <PreviewProvider>
      <PreviewBanner house="beauty" lang={lang} id={id} token={typeof sp?.token === "string" && !res.draftGone ? sp.token : null} requestId={res.request?.id || null} state={res} />
      <BeautyProductView product={res.product} variants={res.variants} related={related} cats={cats} lang={lang} />
    </PreviewProvider>
  );
}
