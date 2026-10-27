"use client";
// Report screen of the Health panel: the shared QuotesReport wired to THIS panel's own export action.
import QuotesReport from "@/components/operator/QuotesReport";
import { exportQuotesCsv } from "@/lib/operator/actions";

export default function QuotesReportManager({ report }) {
  return <QuotesReport report={report} base="/operator/quotes" exportAction={exportQuotesCsv} />;
}
