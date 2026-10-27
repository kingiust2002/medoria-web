// app/operator/(panel)/quotes/page.jsx
import { getQuotes, getQuoteAssignees } from "@/lib/operator/data";
import QuotesManager from "@/components/operator/QuotesManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { mayView } from "@/lib/operator/access";
import { QUOTE_LIST_LIMIT, mayBeTruncated } from "@/lib/operator/listLimits";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ searchParams }) {
  const session = await requireHealthSession("quotes.view");
  const [quotes, people] = await Promise.all([getQuotes(), getQuoteAssignees()]);
  const reportHref = mayView(session, "health", "reports.view") ? "/operator/quotes/report" : null;
  const initialQuery = String((await searchParams)?.q ?? "").slice(0, 80);       // a link from the quick search
  return <QuotesManager quotes={quotes} now={Date.now()} reportHref={reportHref} people={people} initialQuery={initialQuery} truncatedAt={mayBeTruncated(quotes, QUOTE_LIST_LIMIT) ? QUOTE_LIST_LIMIT : 0} />;
}
