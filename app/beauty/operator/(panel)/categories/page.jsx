// app/beauty/operator/(panel)/categories/page.jsx
import { getBeautyCategoriesWithCounts } from "@/lib/beauty/operator/data";
import CategoriesManager from "@/components/beauty/operator/CategoriesManager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await getBeautyCategoriesWithCounts();
  return <CategoriesManager categories={categories} />;
}
