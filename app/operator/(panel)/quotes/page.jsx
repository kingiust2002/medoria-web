// app/operator/(panel)/quotes/page.jsx
import { getQuotes } from "@/lib/operator/data";
import QuotesManager from "@/components/operator/QuotesManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  await requireHealthSession();
  const quotes = await getQuotes();
  return <QuotesManager quotes={quotes} now={Date.now()} />;
}
