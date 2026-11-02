// app/operator/(panel)/categories/page.jsx
import HealthCategoryTree from "@/components/operator/HealthCategoryTree";
import { getHealthCategoryTreeAdmin } from "@/lib/operator/categoryTreeData";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { focusReady } from "@/lib/operator/focusScope";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireHealthSession(["categories.view", "products.view"]);
  const tree = await getHealthCategoryTreeAdmin();
  return <HealthCategoryTree tree={tree} focusAvailable={await focusReady(getAdminClient(), "categories")} />;
}
