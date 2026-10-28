"use client";
// Quotes screen of this panel: the shared QuotesPanel wired to THIS panel's own
// server actions (its own session check and its own table; see lib/operator/quoteDelete.js).
import { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, deleteQuotes, setQuoteFollowUp, retryQuoteNotice } from "@/lib/beauty/operator/actions";
import QuotesPanel from "@/components/operator/QuotesPanel";

const actions = { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, deleteQuotes, setQuoteFollowUp, retryQuoteNotice };

export default function QuotesManager({ data, now, reportHref, people }) {
  return <QuotesPanel data={data} actions={actions} now={now} reportHref={reportHref} people={people} basePath="/beauty/operator/quotes" />;
}
