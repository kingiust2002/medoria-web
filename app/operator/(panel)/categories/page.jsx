// app/operator/(panel)/categories/page.jsx
import { getCategoriesWithCounts } from "@/lib/operator/data";
import CategoriesManager from "@/components/operator/CategoriesManager";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await getCategoriesWithCounts();
  return <CategoriesManager categories={categories} />;
}
