// app/beauty/operator/(panel)/page.jsx — Beauty dashboard.
import Link from "next/link";
import { redirect } from "next/navigation";
import { preferencesOf } from "@/lib/operator/preferencesPage";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import Icon from "@/components/shared/Icon";
import { beautyImageUrl as imageUrl } from "@/lib/beauty/catalog";
import { getBeautyDashboardData } from "@/lib/beauty/operator/data";
import { isAdminConfigured } from "@/lib/operator/supabaseAdmin";
import { QUOTE_STATUS_FA, QUOTE_STATUS_TONE } from "@/lib/beauty/operator/constants";
import {
  PageHeader, StatCard, SectionCard, Badge, EmptyState, productDisplayName, priceText,
} from "@/components/operator/ui";
import { getPanel } from "@/lib/panel/server";
import { tr, formatDate } from "@/lib/panel/i18n";
import Trans from "@/components/panel/Trans";

export const dynamic = "force-dynamic";

function shortDate(lang, v) {
  if (!v) return "—";
  return formatDate(lang, v, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const BASE = "/beauty/operator";
const QUICK = [
  { href: `${BASE}/products/new`, label: tr("افزودن محصول"), icon: "plus", primary: true },
  { href: `${BASE}/products`, label: tr("مدیریت محصولات"), icon: "package" },
  { href: `${BASE}/categories`, label: tr("دسته‌بندی‌ها"), icon: "layers" },
  { href: `${BASE}/quotes`, label: tr("استعلام‌ها"), icon: "quote" },
];

export default async function BeautyDashboardPage({ searchParams }) {
  const { t, lang } = await getPanel();
  const session = await requireBeautySession();
  // right after a login the person's own start page opens, if they chose one (the menu's Dashboard link never redirects)
  if ((await searchParams)?.start === "1") {
    const prefs = await preferencesOf(session, "beauty");
    if (prefs.startPage) redirect(prefs.startPage);
  }
  const configured = isAdminConfigured();
  const { access, stats, recentProducts, recentQuotes } = await getBeautyDashboardData();

  return (
    <>
      <PageHeader title={t("داشبورد بیوتی")} subtitle={t("نمای کلی کاتالوگ لوکس و استعلام‌ها")}>
        {access.create && (
          <Link href={`${BASE}/products/new`} className="btn-primary size-md">
            <Icon name="plus" size={18} /> {t("افزودن محصول")}</Link>
        )}
      </PageHeader>

      {!configured && (
        <div className="card p-4 mb-6 flex items-start gap-3 border-warn/30 bg-warn/5">
          <span className="text-warn shrink-0 mt-0.5"><Icon name="alertTriangle" size={18} /></span>
          <div className="text-sm text-ink-soft">
            <p className="font-semibold text-ink">{t("اتصال به پایگاه داده کامل نیست")}</p>
            <p className="text-ink-muted mt-1 leading-relaxed"><Trans t={t} k="متغیر {name} تنظیم نشده است. بدون آن، پنل نمی‌تواند داده‌ها را بخواند یا ذخیره کند. راهنما در صفحه «تنظیمات»." values={{ name: <code className="text-xs bg-line-soft px-1.5 py-0.5 rounded">SUPABASE_SERVICE_ROLE_KEY</code> }} /></p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {access.products && <StatCard icon="package"  tone="violet" label={t("کل محصولات")}        value={stats?.total ?? "—"} />}
        {access.products && <StatCard icon="badgeCheck" tone="ok"   label={t("محصولات فعال")}       value={stats?.active ?? "—"} />}
        {access.products && <StatCard icon="dollar"   tone="warn"   label={t("بدون قیمت (استعلام)")} value={stats?.noPrice ?? "—"} />}
        {access.products && <StatCard icon="image"    tone="muted"  label={t("بدون تصویر")}          value={stats?.noImage ?? "—"} />}
        {access.products && <StatCard icon="alertTriangle" tone="warn" label={t("محصولات با اطلاعات ناقص")} value={stats?.incomplete ?? "—"} />}
        {access.quotes && <StatCard icon="quote"    tone="blue"   label={t("استعلام‌های جدید")}     value={stats?.newQuotes ?? "—"} />}
        {access.quotes && <StatCard icon="chat"     tone="violet" label={t("کل استعلام‌ها")}        value={stats?.totalQuotes ?? "—"} />}
        {access.quotes && <StatCard icon="alertTriangle" tone="warn" label={t("بدون پاسخ بیش از ۲۴ ساعت")} value={stats?.overdueQuotes ?? "—"} />}
        {access.quotes && <StatCard icon="send"     tone="warn"   label={t("اعلان تلگرام نرسیده")}   value={stats?.notifyFailures ?? "—"} />}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-8">
        {QUICK.filter((q) => (q.href.endsWith("/new") ? access.create : q.href.endsWith("/products") ? access.products : q.href.endsWith("/quotes") ? access.quotes : true)).map((q) => (
          <Link key={q.href} href={q.href} className={`${q.primary ? "btn-primary" : "btn-ghost"} size-sm`}>
            <Icon name={q.icon} size={16} /> {t(q.label)}
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent quotes */}
        {access.quotes && <SectionCard title={t("استعلام‌های اخیر")} icon="quote">
          {recentQuotes?.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {recentQuotes.map((q) => (
                <li key={q.id} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{q.name || t("بدون نام")}</p>
                    <p className="text-xs text-ink-muted truncate">{q.product_name || t("درخواست عمومی")} · {shortDate(lang, q.created_at)}</p>
                  </div>
                  <Badge tone={QUOTE_STATUS_TONE[q.status] || "neutral"}>{QUOTE_STATUS_FA[q.status] ? t(QUOTE_STATUS_FA[q.status]) : q.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted py-6 text-center">{t("هنوز استعلامی ثبت نشده است.")}</p>
          )}
          <Link href={`${BASE}/quotes`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-violet mt-4 hover:gap-2.5 transition-all">{t("مشاهده همه")} <Icon name="chevronLeft" size={14} className="ltr:-scale-x-100" />
          </Link>
        </SectionCard>}

        {/* Recently updated products */}
        {access.products && <SectionCard title={t("محصولات اخیراً به‌روزشده")} icon="refresh">
          {recentProducts?.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {recentProducts.map((p) => {
                const img = p.image_url ? imageUrl(p.image_url) : null;
                return (
                  <li key={p.id} className="py-3 flex items-center gap-3 first:pt-0 last:pb-0">
                    <span className="img-ph w-10 h-10 rounded-lg overflow-hidden shrink-0 grid place-items-center text-ink-faint">
                      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Icon name="image" size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink truncate">{productDisplayName(p, lang)}</p>
                      <p className="text-xs text-ink-muted truncate">{[p.brand, p.sku].filter(Boolean).join(" · ") || "—"} · {priceText(p, t)}</p>
                    </div>
                    <Link href={`${BASE}/products/${p.id}/edit`} className="btn-ghost size-xs shrink-0">
                      <Icon name="edit" size={14} /> {t("ویرایش")}</Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="sparkles" title={t("هنوز محصولی نیست")} desc={t("اولین محصول لوکس کاتالوگ را اضافه کنید.")}>
              <Link href={`${BASE}/products/new`} className="btn-primary size-sm"><Icon name="plus" size={16} /> {t("افزودن محصول")}</Link>
            </EmptyState>
          )}
        </SectionCard>}
      </div>
    </>
  );
}
