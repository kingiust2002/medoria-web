// app/operator/(panel)/products/new/page.jsx
import { getAdminCategories } from "@/lib/operator/data";
import ProductForm from "@/components/operator/ProductForm";
import { requireHealthSession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireHealthSession("products.create");
  const categories = await getAdminCategories();
  return <ProductForm mode="new" categories={categories} />;
}
