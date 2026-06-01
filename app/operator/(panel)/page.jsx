// app/operator/(panel)/page.jsx — dashboard.
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { imageUrl } from "@/lib/supabase";
import { getDashboardData } from "@/lib/operator/data";
import { isAdminConfigured } from "@/lib/operator/supabaseAdmin";
import { QUOTE_STATUS_FA, QUOTE_STATUS_TONE } from "@/lib/operator/constants";
import {
  PageHeader, StatCard, SectionCard, Badge, EmptyState, productDisplayName, priceText,
} from "@/components/operator/ui";

export const dynamic = "force-dynamic";

function faDate(v) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

const QUICK = [
  { href: "/operator/products/new", label: "افزودن محصول", icon: "plus", primary: true },
  { href: "/operator/products", label: "مدیریت محصولات", icon: "package" },
  { href: "/operator/categories", label: "دسته‌بندی‌ها", icon: "layers" },
  { href: "/operator/quotes", label: "استعلام‌ها", icon: "quote" },
];

export default async function DashboardPage() {
  const configured = isAdminConfigured();
  const { stats, recentProducts, recentQuotes } = await getDashboardData();

  return (
    <>
      <PageHeader title="داشبورد" subtitle="نمای کلی فروشگاه و استعلام‌ها">
        <Link href="/operator/products/new" className="btn-primary size-md">
          <Icon name="plus" size={18} /> افزودن محصول
        </Link>
      </PageHeader>

      {!configured && (
        <div className="card p-4 mb-6 flex items-start gap-3 border-warn/30 bg-warn/5">
          <span className="text-warn shrink-0 mt-0.5"><Icon name="alertTriangle" size={18} /></span>
          <div className="text-sm text-ink-soft">
            <p className="font-semibold text-ink">اتصال به پایگاه داده کامل نیست</p>
            <p className="text-ink-muted mt-1 leading-relaxed">
              متغیر <code className="text-xs bg-line-soft px-1.5 py-0.5 rounded">SUPABASE_SERVICE_ROLE_KEY</code> تنظیم نشده است.
              بدون آن، پنل نمی‌تواند داده‌ها را بخواند یا ذخیره کند. راهنما در صفحه «تنظیمات».
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard icon="package"  tone="violet" label="کل محصولات"        value={stats?.total ?? "—"} />
        <StatCard icon="badgeCheck" tone="ok"   label="محصولات فعال"       value={stats?.active ?? "—"} />
        <StatCard icon="dollar"   tone="warn"   label="بدون قیمت (استعلام)" value={stats?.noPrice ?? "—"} />
        <StatCard icon="image"    tone="muted"  label="بدون تصویر"          value={stats?.noImage ?? "—"} />
        <StatCard icon="quote"    tone="blue"   label="استعلام‌های جدید"     value={stats?.newQuotes ?? "—"} />
        <StatCard icon="chat"     tone="violet" label="کل استعلام‌ها"        value={stats?.totalQuotes ?? "—"} />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-8">
        {QUICK.map((q) => (
          <Link key={q.href} href={q.href} className={`${q.primary ? "btn-primary" : "btn-ghost"} size-sm`}>
            <Icon name={q.icon} size={16} /> {q.label}
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent quotes */}
        <SectionCard title="استعلام‌های اخیر" icon="quote">
          {recentQuotes?.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {recentQuotes.map((q) => (
                <li key={q.id} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">{q.name || "بدون نام"}</p>
                    <p className="text-xs text-ink-muted truncate">{q.product_name || "درخواست عمومی"} · {faDate(q.created_at)}</p>
                  </div>
                  <Badge tone={QUOTE_STATUS_TONE[q.status] || "neutral"}>{QUOTE_STATUS_FA[q.status] || q.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted py-6 text-center">هنوز استعلامی ثبت نشده است.</p>
          )}
          <Link href="/operator/quotes" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-violet mt-4 hover:gap-2.5 transition-all">
            مشاهده همه <Icon name="chevronLeft" size={14} />
          </Link>
        </SectionCard>

        {/* Recently updated products */}
        <SectionCard title="محصولات اخیراً به‌روزشده" icon="refresh">
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
                      <p className="font-medium text-ink truncate">{productDisplayName(p)}</p>
                      <p className="text-xs text-ink-muted truncate">{p.sku || "—"} · {priceText(p)}</p>
                    </div>
                    <Link href={`/operator/products/${p.id}/edit`} className="btn-ghost size-xs shrink-0">
                      <Icon name="edit" size={14} /> ویرایش
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="package" title="هنوز محصولی نیست" desc="اولین محصول خود را اضافه کنید.">
              <Link href="/operator/products/new" className="btn-primary size-sm"><Icon name="plus" size={16} /> افزودن محصول</Link>
            </EmptyState>
          )}
        </SectionCard>
      </div>
    </>
  );
}
