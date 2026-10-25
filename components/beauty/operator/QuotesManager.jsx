"use client";
// Quotes screen of this panel: the shared QuotesPanel wired to THIS panel's own
// server actions (its own session check and its own table; see lib/operator/quoteDelete.js).
import { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, deleteQuotes } from "@/lib/beauty/operator/actions";
import QuotesPanel from "@/components/operator/QuotesPanel";

const actions = { updateQuoteStatus, updateQuoteNotes, assignQuote, deleteQuote, updateQuotesStatus, deleteQuotes };

export default function QuotesManager({ quotes, now }) {
  return <QuotesPanel quotes={quotes} actions={actions} now={now} />;
}
