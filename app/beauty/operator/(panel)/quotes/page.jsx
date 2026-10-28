// app/beauty/operator/(panel)/quotes/page.jsx
import { getBeautyQuotes, getBeautyQuoteAssignees } from "@/lib/beauty/operator/data";
import QuotesManager from "@/components/beauty/operator/QuotesManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { mayView } from "@/lib/operator/access";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const session = await requireBeautySession("quotes.view");
  const [quotes, people] = await Promise.all([getBeautyQuotes(), getBeautyQuoteAssignees()]);
  const reportHref = mayView(session, "beauty", "reports.view") ? "/beauty/operator/quotes/report" : null;
  return <QuotesManager quotes={quotes} now={Date.now()} reportHref={reportHref} people={people} />;
}
