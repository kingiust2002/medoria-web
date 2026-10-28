"use client";
// Quotes screen of this panel: the shared QuotesPanel wired to THIS panel's own
// server actions (its own session check and its own table; see lib/operator/quoteDelete.js).
import { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, updateFilteredQuotesStatus, deleteQuotes, setQuoteFollowUp, retryQuoteNotice } from "@/lib/operator/actions";
import QuotesPanel from "@/components/operator/QuotesPanel";
import { saveListView, deleteListView } from "@/lib/operator/savedViewActions";

const viewActions = { save: saveListView, remove: deleteListView };
const actions = { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, updateFilteredQuotesStatus, deleteQuotes, setQuoteFollowUp, retryQuoteNotice };

export default function QuotesManager({ data, now, reportHref, people, views }) {
  return <QuotesPanel data={data} actions={actions} now={now} reportHref={reportHref} people={people} views={views} viewActions={viewActions} basePath="/operator/quotes" />;
}
