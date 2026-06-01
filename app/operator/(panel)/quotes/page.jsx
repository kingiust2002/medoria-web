// app/operator/(panel)/quotes/page.jsx
import { getQuotes } from "@/lib/operator/data";
import QuotesManager from "@/components/operator/QuotesManager";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const quotes = await getQuotes();
  return <QuotesManager quotes={quotes} />;
}
