// app/beauty/operator/(panel)/content/page.jsx — the site content of Beauty (announcement banner, FAQ). Needs content.view.
import ContentManager from "@/components/beauty/operator/ContentManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { listContent } from "@/lib/content/actionsCore";
import { CONTENT_MESSAGES } from "@/lib/siteContent";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  await requireBeautySession("content.view");
  const admin = getAdminClient();
  const res = admin ? await listContent(admin, "beauty") : { ok: false, error: CONTENT_MESSAGES.unavailable };
  return <ContentManager data={{ ...res, now: new Date().toISOString() }} />;
}
