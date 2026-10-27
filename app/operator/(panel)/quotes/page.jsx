// app/operator/(panel)/quotes/page.jsx
import { getQuotes, getQuoteAssignees } from "@/lib/operator/data";
import QuotesManager from "@/components/operator/QuotesManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { mayView } from "@/lib/operator/access";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const session = await requireHealthSession("quotes.view");
  const [quotes, people] = await Promise.all([getQuotes(), getQuoteAssignees()]);
  const reportHref = mayView(session, "health", "reports.view") ? "/operator/quotes/report" : null;
  return <QuotesManager quotes={quotes} now={Date.now()} reportHref={reportHref} people={people} />;
}
