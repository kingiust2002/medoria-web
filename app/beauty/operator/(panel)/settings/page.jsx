// app/beauty/operator/(panel)/settings/page.jsx — configuration status +
// setup guidance for the BEAUTY panel (its own env vars + migration 10).
import Icon from "@/components/shared/Icon";
import { hasSessionSecret, hasPasswordHash, hasUsername } from "@/lib/beauty/operator/auth";
import { isAdminConfigured } from "@/lib/operator/supabaseAdmin";
import { PageHeader, SectionCard } from "@/components/operator/ui";
import LogoutButton from "@/components/beauty/operator/LogoutButton";

export const dynamic = "force-dynamic";

function StatusRow({ ok, label, hint }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className={`grid place-items-center w-6 h-6 rounded-full shrink-0 mt-0.5 ${ok ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn"}`}>
        <Icon name={ok ? "check" : "close"} size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint && <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{hint}</p>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const secret = hasSessionSecret();
  const user = hasUsername();
  const pass = hasPasswordHash();
  const admin = isAdminConfigured();
  const translate = Boolean(process.env.GOOGLE_TRANSLATE_API_KEY);

  return (
    <>
      <PageHeader title="تنظیمات" subtitle="وضعیت پیکربندی پنل بیوتی و راهنمای راه‌اندازی">
        <LogoutButton />
      </PageHeader>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="وضعیت پیکربندی" desc="این متغیرها در محیط سرور (env) تنظیم می‌شوند — جدا از Health" icon="shield">
          <div className="divide-y divide-line">
            <StatusRow ok={secret} label="BEAUTY_OPERATOR_SESSION_SECRET" hint={secret ? "تنظیم شده — نشست‌های بیوتی جدا امضا می‌شوند." : "اجباری. حداقل ۱۶ کاراکتر تصادفی؛ با مقدار Health یکی نباشد."} />
            <StatusRow ok={user} label="BEAUTY_OPERATOR_USERNAME" hint={user ? "تنظیم شده." : "اجباری. نام کاربری ورود پنل بیوتی."} />
            <StatusRow ok={pass} label="BEAUTY_OPERATOR_PASSWORD_HASH" hint={pass ? "تنظیم شده." : "هش رمز عبور پنل بیوتی را تنظیم کنید."} />
            <StatusRow ok={admin} label="SUPABASE_SERVICE_ROLE_KEY" hint={admin ? "تنظیم شده — خواندن/نوشتن و آپلود فعال است (مشترک با Health)." : "بدون آن نمی‌توان داده‌ها را ذخیره یا آپلود کرد."} />
            <StatusRow ok={translate} label="GOOGLE_TRANSLATE_API_KEY" hint={translate ? "دکمه‌ی ترجمه‌ی خودکار فعال است." : "اختیاری — برای دکمه‌ی ترجمه‌ی خودکار در فرم محصول."} />
          </div>
        </SectionCard>

        <SectionCard title="ساخت رمز عبور" desc="رمز به‌صورت هش امن ذخیره می‌شود (نه متن ساده)" icon="lock">
          <ol className="text-sm text-ink-soft space-y-2 list-decimal pr-4 leading-relaxed">
            <li>در ترمینال پروژه اجرا کنید:</li>
          </ol>
          <pre dir="ltr" className="mt-2 bg-canvas-soft border border-line rounded-xl p-3 text-xs overflow-auto text-ink-soft">node scripts/hash-operator-password.mjs &apos;YourStrongPassword&apos;</pre>
          <p className="text-xs text-ink-muted mt-2 leading-relaxed">
            مقدار <code className="bg-line-soft px-1 rounded text-[11px]">scrypt:…:…</code> چاپ‌شده را در
            <code className="bg-line-soft px-1 rounded text-[11px] mx-1">BEAUTY_OPERATOR_PASSWORD_HASH</code> قرار دهید و سرویس را ری‌استارت کنید.
          </p>
        </SectionCard>

        <SectionCard title="مایگریشن پایگاه داده" desc="در Supabase → SQL Editor اجرا کنید" icon="layers">
          <ul className="text-sm text-ink-soft space-y-1.5 leading-relaxed">
            <li className="flex items-center gap-2"><Icon name="chevronLeft" size={13} className="text-brand-violet" /> <code className="text-xs" dir="ltr">migrations/10_beauty_catalog.sql</code></li>
          </ul>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">
            یک فایل، همه‌چیز: جدول‌های beauty_categories / beauty_products / beauty_quote_requests،
            باکت تصاویر، RLS و دسته‌های شروع. چند بار اجراشدنش امن است و به جدول‌های Health دست نمی‌زند.
          </p>
        </SectionCard>

        <SectionCard title="آپلود تصویر (Storage)" desc="باکت جدای Supabase برای تصاویر بیوتی" icon="image">
          <p className="text-sm text-ink-soft leading-relaxed">
            باکت <code className="bg-line-soft px-1 rounded text-[11px]" dir="ltr">beauty-product-images</code> باید عمومی (public read) باشد.
            با اجرای مایگریشن ۱۰ یا از مسیر Supabase → Storage → New bucket ساخته می‌شود.
          </p>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">آپلودها سمت سرور با کلید service-role انجام می‌شوند؛ هیچ کلیدی در مرورگر قرار نمی‌گیرد.</p>
        </SectionCard>
      </div>
    </>
  );
}
