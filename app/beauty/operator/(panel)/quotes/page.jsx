// app/beauty/operator/(panel)/quotes/page.jsx — Beauty requests: one server-filtered, server-counted page (state in the address).
import { getBeautyQuotesPage, getBeautyQuoteAssignees } from "@/lib/beauty/operator/data";
import QuotesManager from "@/components/beauty/operator/QuotesManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { mayView } from "@/lib/operator/access";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ searchParams }) {
  const session = await requireBeautySession("quotes.view");
  const [data, people] = await Promise.all([getBeautyQuotesPage(await searchParams), getBeautyQuoteAssignees()]);
  const reportHref = mayView(session, "beauty", "reports.view") ? "/beauty/operator/quotes/report" : null;
  return <QuotesManager data={data} now={Date.now()} reportHref={reportHref} people={people} />;
}
