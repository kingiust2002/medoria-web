// app/beauty/operator/(panel)/quotes/page.jsx
import { getBeautyQuotes, getBeautyQuoteAssignees } from "@/lib/beauty/operator/data";
import QuotesManager from "@/components/beauty/operator/QuotesManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { mayView } from "@/lib/operator/access";
import { QUOTE_LIST_LIMIT, mayBeTruncated } from "@/lib/operator/listLimits";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ searchParams }) {
  const session = await requireBeautySession("quotes.view");
  const [quotes, people] = await Promise.all([getBeautyQuotes(), getBeautyQuoteAssignees()]);
  const reportHref = mayView(session, "beauty", "reports.view") ? "/beauty/operator/quotes/report" : null;
  const initialQuery = String((await searchParams)?.q ?? "").slice(0, 80);       // a link from the quick search
  return <QuotesManager quotes={quotes} now={Date.now()} reportHref={reportHref} people={people} initialQuery={initialQuery} truncatedAt={mayBeTruncated(quotes, QUOTE_LIST_LIMIT) ? QUOTE_LIST_LIMIT : 0} />;
}
