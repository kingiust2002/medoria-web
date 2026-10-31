// app/health/[lang]/preview/[id]/page.jsx — the PRIVATE preview of a Health product on the real public page (N5).
// Never public: a visitor without a panel session and the right to see products gets a plain 404 (no redirect, nothing to learn); the page is
// rendered per request (no cache, no static copy), carries noindex / no-store, and records no view and sends no request.
// `id` is a product number or "new"; `?token=` is an unsaved form draft of THIS session; `?request=` is a pending change request.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getSession } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { loadPreview } from "@/lib/operator/previewLoad";
import { PreviewProvider } from "@/components/shared/PreviewContext";
import PreviewBanner from "@/components/operator/PreviewBanner";
import ProductDetailClient from "../../catalog/[slug]/ProductDetailClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export function generateMetadata() {
  return { title: "Preview", robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true, noimageindex: true } };
}

export default async function HealthPreviewPage(props) {
  const { lang, id } = await props.params;
  const sp = await props.searchParams;
  if (!LOCALES.includes(lang)) notFound();
  const res = await loadPreview({ house: "health", session: await getSession(), admin: getAdminClient(), id, token: typeof sp?.token === "string" ? sp.token : null, requestId: typeof sp?.request === "string" ? sp.request : null });
  if (res.state !== "ok") notFound();
  return (
    <PreviewProvider>
      <PreviewBanner house="health" lang={lang} id={id} token={typeof sp?.token === "string" && !res.draftGone ? sp.token : null} requestId={res.request?.id || null} state={res} />
      <ProductDetailClient product={res.product} lang={lang} variants={res.variants} />
    </PreviewProvider>
  );
}
