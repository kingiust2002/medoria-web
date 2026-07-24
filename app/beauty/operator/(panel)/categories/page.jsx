// app/beauty/operator/(panel)/categories/page.jsx
import { getBeautyCategoryTreeAdmin } from "@/lib/beauty/operator/data";
import CategoryTree from "@/components/beauty/operator/CategoryTree";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const tree = await getBeautyCategoryTreeAdmin();
  return <CategoryTree tree={tree} />;
}
