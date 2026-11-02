// app/beauty/operator/(panel)/categories/page.jsx
import { getBeautyCategoryTreeAdmin } from "@/lib/beauty/operator/data";
import CategoryTree from "@/components/beauty/operator/CategoryTree";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { focusReady } from "@/lib/operator/focusScope";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireBeautySession(["categories.view", "products.view"]);
  const tree = await getBeautyCategoryTreeAdmin();
  return <CategoryTree tree={tree} focusAvailable={await focusReady(getAdminClient(), "beauty_categories")} />;
}
