"use client";
// Report screen of the Beauty panel: the shared QuotesReport wired to THIS panel's own export action.
import QuotesReport from "@/components/operator/QuotesReport";
import { exportQuotesCsv } from "@/lib/beauty/operator/actions";

export default function QuotesReportManager({ report }) {
  return <QuotesReport report={report} base="/beauty/operator/quotes" exportAction={exportQuotesCsv} />;
}
