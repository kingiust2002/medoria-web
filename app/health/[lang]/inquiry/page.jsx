// app/health/[lang]/inquiry/page.jsx — the inquiry list: several products, one request.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import InquiryClient from "./InquiryClient";

export const metadata = { robots: { index: false, follow: false } };   // a personal page, not for search engines

export default async function InquiryPage(props) {
  const { lang } = await props.params;
  if (!LOCALES.includes(lang)) notFound();
  return <InquiryClient lang={lang} />;
}
