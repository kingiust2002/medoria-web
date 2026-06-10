// app/operator/(panel)/settings/page.jsx — configuration status + setup guidance.
import Icon from "@/components/shared/Icon";
import { hasSessionSecret, hasPasswordHash, hasUsername } from "@/lib/operator/auth";
import { isAdminConfigured } from "@/lib/operator/supabaseAdmin";
import { PageHeader, SectionCard } from "@/components/operator/ui";
import LogoutButton from "@/components/operator/LogoutButton";

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
      <PageHeader title="تنظیمات" subtitle="وضعیت پیکربندی و راهنمای راه‌اندازی">
        <LogoutButton />
      </PageHeader>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="وضعیت پیکربندی" desc="این متغیرها در محیط سرور (env) تنظیم می‌شوند" icon="shield">
          <div className="divide-y divide-line">
            <StatusRow ok={secret} label="OPERATOR_SESSION_SECRET" hint={secret ? "تنظیم شده — نشست‌ها امضا می‌شوند." : "اجباری. بدون آن ورود غیرممکن است."} />
            <StatusRow ok={user} label="OPERATOR_USERNAME" hint={user ? "تنظیم شده." : "اجباری. نام کاربری ورود اپراتور را تنظیم کنید."} />
            <StatusRow ok={pass} label="OPERATOR_PASSWORD_HASH" hint={pass ? "تنظیم شده." : "هش رمز عبور اپراتور را تنظیم کنید."} />
            <StatusRow ok={admin} label="SUPABASE_SERVICE_ROLE_KEY" hint={admin ? "تنظیم شده — خواندن/نوشتن و آپلود فعال است." : "بدون آن نمی‌توان داده‌ها را ذخیره یا آپلود کرد."} />
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
            <code className="bg-line-soft px-1 rounded text-[11px] mx-1">OPERATOR_PASSWORD_HASH</code> قرار دهید و سرویس را ری‌استارت کنید.
          </p>
        </SectionCard>

        <SectionCard title="مایگریشن‌های پایگاه داده" desc="در Supabase → SQL Editor به‌ترتیب اجرا کنید" icon="layers">
          <ul className="text-sm text-ink-soft space-y-1.5 leading-relaxed">
            <li className="flex items-center gap-2"><Icon name="chevronLeft" size={13} className="text-brand-violet" /> <code className="text-xs" dir="ltr">migrations/04_operator_fields.sql</code></li>
            <li className="flex items-center gap-2"><Icon name="chevronLeft" size={13} className="text-brand-violet" /> <code className="text-xs" dir="ltr">migrations/05_quote_requests_ops.sql</code></li>
            <li className="flex items-center gap-2"><Icon name="chevronLeft" size={13} className="text-brand-violet" /> <code className="text-xs" dir="ltr">migrations/06_storage_product_images.sql</code></li>
          </ul>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">بدون ۰۴/۰۵ امکان ذخیرهٔ برخی فیلدها نیست. سایت عمومی بدون این‌ها هم سالم می‌ماند.</p>
        </SectionCard>

        <SectionCard title="آپلود تصویر (Storage)" desc="باکت Supabase برای تصاویر محصول" icon="image">
          <p className="text-sm text-ink-soft leading-relaxed">
            باکت <code className="bg-line-soft px-1 rounded text-[11px]" dir="ltr">product-images</code> باید عمومی (public read) باشد.
            با اجرای مایگریشن ۰۶ یا از مسیر Supabase → Storage → New bucket ساخته می‌شود.
          </p>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">آپلودها سمت سرور با کلید service-role انجام می‌شوند؛ هیچ کلیدی در مرورگر قرار نمی‌گیرد.</p>
        </SectionCard>
      </div>
    </>
  );
}
