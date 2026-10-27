// app/operator/(panel)/settings/page.jsx — configuration status + setup guidance.
import Icon from "@/components/shared/Icon";
import { hasSessionSecret, hasPasswordHash, hasUsername, getSession, isTwoStepEnabled, recoveryCodesLeft } from "@/lib/operator/auth";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { listSessions } from "@/lib/operator/security";
import SessionsCard from "@/components/operator/SessionsCard";
import { revokeOtherSessions, revokeAllSessions } from "@/lib/operator/securityActions";
import { isAdminConfigured } from "@/lib/operator/supabaseAdmin";
import { PageHeader, SectionCard } from "@/components/operator/ui";
import LogoutButton from "@/components/operator/LogoutButton";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { getT } from "@/lib/panel/server";
import Trans from "@/components/panel/Trans";

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

export default async function SettingsPage() {
  const t = await getT();
  await requireHealthSession();
  const secret = hasSessionSecret();
  const user = hasUsername();
  const pass = hasPasswordHash();
  const admin = isAdminConfigured();
  const translate = Boolean(process.env.GOOGLE_TRANSLATE_API_KEY);
  const session = await getSession();
  const sessions = await listSessions(getAdminClient(), { panel: "health", userId: session?.user?.id });
  const registryReady = Boolean(session?.sid) && sessions.some((s) => s.sid === session.sid);
  const twoStep = isTwoStepEnabled();

  return (
    <>
      <PageHeader title={t("تنظیمات")} subtitle={t("وضعیت پیکربندی و راهنمای راه‌اندازی")}>
        <LogoutButton />
      </PageHeader>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title={t("نشست‌ها")} desc={t("هر ورود یک نشست ثبت‌شده است؛ خروج و «پایان نشست‌ها» نشست را روی سرور می‌بندد")} icon="lock">
          <SessionsCard sessions={sessions} currentSid={session?.sid} registryReady={registryReady} loginHref="/login/health"
            actions={{ revokeOthers: revokeOtherSessions, revokeAll: revokeAllSessions }} />
        </SectionCard>

        <SectionCard title={t("ورود دومرحله‌ای")} desc={t("کد ۶ رقمی برنامهٔ احراز هویت + کدهای بازیابی یک‌بارمصرف")} icon="shield">
          <StatusRow ok={twoStep} label={twoStep ? t("فعال") : t("غیرفعال")}
            hint={twoStep ? t("کدهای بازیابی باقی‌مانده در تنظیمات سرور: {recoveryCodesLeft}. گم‌شدن گوشی: از یک کد بازیابی استفاده کنید.", { recoveryCodesLeft: recoveryCodesLeft() }) : t("فعال‌سازی فقط روی سرور و با اسکریپت انجام می‌شود: node scripts/operator-2fa.mjs health (راهنما: docs/OPERATOR_SECURITY.md).")} />
        </SectionCard>

        <SectionCard title={t("وضعیت پیکربندی")} desc={t("این متغیرها در محیط سرور (env) تنظیم می‌شوند")} icon="shield">
          <div className="divide-y divide-line">
            <StatusRow ok={secret} label="OPERATOR_SESSION_SECRET" hint={secret ? t("تنظیم شده — نشست‌ها امضا می‌شوند.") : t("اجباری. بدون آن ورود غیرممکن است.")} />
            <StatusRow ok={user} label="OPERATOR_USERNAME" hint={user ? t("تنظیم شده.") : t("اجباری. نام کاربری ورود اپراتور را تنظیم کنید.")} />
            <StatusRow ok={pass} label="OPERATOR_PASSWORD_HASH" hint={pass ? t("تنظیم شده.") : t("هش رمز عبور اپراتور را تنظیم کنید.")} />
            <StatusRow ok={admin} label="SUPABASE_SERVICE_ROLE_KEY" hint={admin ? t("تنظیم شده — خواندن/نوشتن و آپلود فعال است.") : t("بدون آن نمی‌توان داده‌ها را ذخیره یا آپلود کرد.")} />
            <StatusRow ok={translate} label="GOOGLE_TRANSLATE_API_KEY" hint={translate ? t("دکمه‌ی ترجمه‌ی خودکار فعال است.") : t("اختیاری — برای دکمه‌ی ترجمه‌ی خودکار در فرم محصول.")} />
          </div>
        </SectionCard>

        <SectionCard title={t("ساخت رمز عبور")} desc={t("رمز به‌صورت هش امن ذخیره می‌شود (نه متن ساده)")} icon="lock">
          <ol className="text-sm text-ink-soft space-y-2 list-decimal ps-4 leading-relaxed">
            <li>{t("در ترمینال پروژه اجرا کنید:")}</li>
          </ol>
          <pre dir="ltr" className="mt-2 bg-canvas-soft border border-line rounded-xl p-3 text-xs overflow-auto text-ink-soft">node scripts/hash-operator-password.mjs &apos;YourStrongPassword&apos;</pre>
          <p className="text-xs text-ink-muted mt-2 leading-relaxed"><Trans t={t} k="مقدار {hash} چاپ‌شده را در {env} قرار دهید و سرویس را ری‌استارت کنید." values={{ hash: <code className="bg-line-soft px-1 rounded text-[11px]">scrypt:…:…</code>, env: <code className="bg-line-soft px-1 rounded text-[11px] mx-1">OPERATOR_PASSWORD_HASH</code> }} /></p>
        </SectionCard>

        <SectionCard title={t("مایگریشن‌های پایگاه داده")} desc={t("در Supabase → SQL Editor به‌ترتیب اجرا کنید")} icon="layers">
          <ul className="text-sm text-ink-soft space-y-1.5 leading-relaxed">
            <li className="flex items-center gap-2"><Icon name="chevronLeft" size={13} className="ltr:-scale-x-100 text-brand-violet" /> <code className="text-xs" dir="ltr">migrations/04_operator_fields.sql</code></li>
            <li className="flex items-center gap-2"><Icon name="chevronLeft" size={13} className="ltr:-scale-x-100 text-brand-violet" /> <code className="text-xs" dir="ltr">migrations/05_quote_requests_ops.sql</code></li>
            <li className="flex items-center gap-2"><Icon name="chevronLeft" size={13} className="ltr:-scale-x-100 text-brand-violet" /> <code className="text-xs" dir="ltr">migrations/06_storage_product_images.sql</code></li>
          </ul>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">{t("بدون ۰۴/۰۵ امکان ذخیرهٔ برخی فیلدها نیست. سایت عمومی بدون این‌ها هم سالم می‌ماند.")}</p>
        </SectionCard>

        <SectionCard title={t("آپلود تصویر (Storage)")} desc={t("باکت Supabase برای تصاویر محصول")} icon="image">
          <p className="text-sm text-ink-soft leading-relaxed"><Trans t={t} k="باکت {name} باید عمومی (public read) باشد. با اجرای مایگریشن ۰۶ یا از مسیر Supabase → Storage → New bucket ساخته می‌شود." values={{ name: <code className="bg-line-soft px-1 rounded text-[11px]" dir="ltr">product-images</code> }} /></p>
          <p className="text-xs text-ink-muted mt-3 leading-relaxed">{t("آپلودها سمت سرور با کلید service-role انجام می‌شوند؛ هیچ کلیدی در مرورگر قرار نمی‌گیرد.")}</p>
        </SectionCard>
      </div>
    </>
  );
}
