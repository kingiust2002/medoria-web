// app/operator/(panel)/categories/page.jsx
import HealthCategoryTree from "@/components/operator/HealthCategoryTree";
import { getHealthCategoryTreeAdmin } from "@/lib/operator/categoryTreeData";
import { requireHealthSession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireHealthSession();
  const tree = await getHealthCategoryTreeAdmin();
  return <HealthCategoryTree tree={tree} />;
}
