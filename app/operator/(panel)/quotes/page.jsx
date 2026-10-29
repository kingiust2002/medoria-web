// app/operator/(panel)/quotes/page.jsx — Health requests: one server-filtered, server-counted page (state in the address).
import { getQuotesPage, getQuoteAssignees } from "@/lib/operator/data";
import QuotesManager from "@/components/operator/QuotesManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { mayView } from "@/lib/operator/access";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ searchParams }) {
  const session = await requireHealthSession("quotes.view");
  const [data, people] = await Promise.all([getQuotesPage(await searchParams), getQuoteAssignees()]);
  const reportHref = mayView(session, "health", "reports.view") ? "/operator/quotes/report" : null;
  return <QuotesManager data={data} now={Date.now()} reportHref={reportHref} people={people} />;
}
