// app/beauty/operator/(panel)/quotes/report/page.jsx — numbers about the customer requests (needs reports.view).
import QuotesReportManager from "@/components/beauty/operator/QuotesReportManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { getBeautyQuoteReportRows } from "@/lib/beauty/operator/data";
import { cleanDays, summarizeReport } from "@/lib/operator/quoteReport";

export const dynamic = "force-dynamic";

export default async function QuotesReportPage({ searchParams }) {
  await requireBeautySession("reports.view");
  const days = cleanDays((await searchParams)?.days);
  const res = await getBeautyQuoteReportRows(days);
  return <QuotesReportManager report={{ ...summarizeReport(res.rows, { now: Date.now(), days }), unavailable: !res.ok }} />;
}
