// app/operator/(panel)/quotes/report/page.jsx — numbers about the customer requests (needs reports.view).
import QuotesReportManager from "@/components/operator/QuotesReportManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { getQuoteReportRows } from "@/lib/operator/data";
import { cleanDays, summarizeReport } from "@/lib/operator/quoteReport";

export const dynamic = "force-dynamic";

export default async function QuotesReportPage({ searchParams }) {
  await requireHealthSession("reports.view");
  const days = cleanDays((await searchParams)?.days);
  const res = await getQuoteReportRows(days);
  return <QuotesReportManager report={{ ...summarizeReport(res.rows, { now: Date.now(), days }), unavailable: !res.ok }} />;
}
