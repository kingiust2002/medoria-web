// app/operator/(panel)/content/page.jsx — the site content of Health (announcement banner, FAQ). Needs content.view.
import ContentManager from "@/components/operator/content/ContentManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { listContent } from "@/lib/content/actionsCore";
import { CONTENT_MESSAGES } from "@/lib/siteContent";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  await requireHealthSession("content.view");
  const admin = getAdminClient();
  const res = admin ? await listContent(admin, "health") : { ok: false, error: CONTENT_MESSAGES.unavailable };
  return <ContentManager data={{ ...res, now: new Date().toISOString() }} />;
}
