// components/layout/TopBar.jsx
import { getTranslations } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";
import { contactApi } from "@/lib/contactLinks";
import { getHouseContact } from "@/lib/contactLive";

export default async function TopBar({ lang }) {
  const { WA_NUMBER, TG_USER, phone: contactPhone, email: EMAIL_HEALTH } = contactApi(await getHouseContact("health"));
  const t = getTranslations(lang);
  const email = EMAIL_HEALTH;
  const phone = contactPhone || "";

  return (
    <div className="hidden md:block bg-navy text-white/70 text-[11px]">
      <div className="container-x flex h-9 items-center justify-between">
        <span className="truncate pe-4 flex items-center gap-2">
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
          {email && (
            <a href={`mailto:${email}`} className="hover:text-white transition-colors flex items-center gap-1.5">
              <Icon name="mail" size={11} />
              {t.common.email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
