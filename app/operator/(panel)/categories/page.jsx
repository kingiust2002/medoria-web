// app/operator/(panel)/categories/page.jsx
import HealthCategoryTree from "@/components/operator/HealthCategoryTree";
import { getHealthCategoryTreeAdmin } from "@/lib/operator/categoryTreeData";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const tree = await getHealthCategoryTreeAdmin();
  return <HealthCategoryTree tree={tree} />;
}
