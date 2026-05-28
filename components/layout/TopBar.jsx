// components/layout/TopBar.jsx
import { getTranslations } from "@/lib/i18n";
import { WA_NUMBER, TG_USER } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

export default function TopBar({ lang }) {
  const t = getTranslations(lang);
  const email = process.env.NEXT_PUBLIC_EMAIL || "sales@medoria.tj";
  const phone = process.env.NEXT_PUBLIC_PHONE || "";

  return (
    <div className="hidden md:block bg-navy text-white/70 text-[11px]">
      <div className="container-x flex h-9 items-center justify-between">
        <span className="truncate pr-4 flex items-center gap-2">
          <Icon name="shield" size={12} className="text-cyan-400 shrink-0" />
          {t.topBar}
        </span>
        <div className="flex items-center gap-5 shrink-0">
          {phone && (
            <a href={`tel:${phone}`} className="hover:text-white transition-colors flex items-center gap-1.5">
              <Icon name="phone" size={11} />
              {phone}
            </a>
          )}
          <a href={`https://wa.me/${WA_NUMBER}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1.5">
            <Icon name="chat" size={11} />
            {t.common.whatsapp}
          </a>
          <a href={`https://t.me/${TG_USER}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1.5">
            <Icon name="send" size={11} />
            {t.common.telegram}
          </a>
          <a href={`mailto:${email}`} className="hover:text-white transition-colors flex items-center gap-1.5">
            <Icon name="mail" size={11} />
            {t.common.email}
          </a>
        </div>
      </div>
    </div>
  );
}
