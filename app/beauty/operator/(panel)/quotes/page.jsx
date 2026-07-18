// app/beauty/operator/(panel)/quotes/page.jsx
import { getBeautyQuotes } from "@/lib/beauty/operator/data";
import QuotesManager from "@/components/beauty/operator/QuotesManager";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const quotes = await getBeautyQuotes();
  return <QuotesManager quotes={quotes} />;
}
