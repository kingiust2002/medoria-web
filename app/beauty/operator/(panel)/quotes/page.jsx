// app/beauty/operator/(panel)/quotes/page.jsx
import { getBeautyQuotes } from "@/lib/beauty/operator/data";
import QuotesManager from "@/components/beauty/operator/QuotesManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  await requireBeautySession();
  const quotes = await getBeautyQuotes();
  return <QuotesManager quotes={quotes} now={Date.now()} />;
}
