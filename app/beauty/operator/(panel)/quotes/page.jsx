// app/beauty/operator/(panel)/quotes/page.jsx — Beauty requests: one server-filtered, server-counted page (state in the address).
import { getBeautyQuotesPage, getBeautyQuoteAssignees } from "@/lib/beauty/operator/data";
import QuotesManager from "@/components/beauty/operator/QuotesManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { mayView } from "@/lib/operator/access";
import { savedViewsOf } from "@/lib/operator/savedViewsPage";
import { columnsOf } from "@/lib/operator/listColumnsPage";
import { preferencesOf } from "@/lib/operator/preferencesPage";
import { defaultSizeOf, withDefaultSize } from "@/lib/operator/listSize";

export const dynamic = "force-dynamic";

export default async function QuotesPage({ searchParams }) {
  const session = await requireBeautySession("quotes.view");
  const defaultSize = defaultSizeOf(await preferencesOf(session, "beauty"), "quotes");
  const [data, people, views, columns] = await Promise.all([getBeautyQuotesPage(withDefaultSize(await searchParams, defaultSize)), getBeautyQuoteAssignees(), savedViewsOf(session, "beauty", "quotes"), columnsOf(session, "beauty", "quotes")]);
  const reportHref = mayView(session, "beauty", "reports.view") ? "/beauty/operator/quotes/report" : null;
  return <QuotesManager data={data} now={Date.now()} reportHref={reportHref} people={people} views={views} columns={columns} defaultSize={defaultSize} />;
}
