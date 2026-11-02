"use client";
// Quotes screen of this panel: the shared QuotesPanel wired to THIS panel's own
// server actions (its own session check and its own table; see lib/operator/quoteDelete.js).
import { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, updateFilteredQuotesStatus, deleteQuotes, setQuoteFollowUp, retryQuoteNotice } from "@/lib/beauty/operator/actions";
import QuotesPanel from "@/components/operator/QuotesPanel";
import { saveListColumns, resetListColumns } from "@/lib/beauty/operator/listColumnActions";
import { saveListView, deleteListView } from "@/lib/beauty/operator/savedViewActions";

const viewActions = { save: saveListView, remove: deleteListView };
const columnActions = { save: saveListColumns, reset: resetListColumns };
const actions = { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, updateFilteredQuotesStatus, deleteQuotes, setQuoteFollowUp, retryQuoteNotice };

export default function QuotesManager({ data, now, reportHref, people, views, columns }) {
  return <QuotesPanel data={data} actions={actions} now={now} reportHref={reportHref} people={people} views={views} viewActions={viewActions} columns={columns} columnActions={columnActions} basePath="/beauty/operator/quotes" />;
}
