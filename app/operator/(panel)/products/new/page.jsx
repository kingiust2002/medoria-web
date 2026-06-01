// app/operator/(panel)/products/new/page.jsx
import { getAdminCategories } from "@/lib/operator/data";
import ProductForm from "@/components/operator/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const categories = await getAdminCategories();
  return <ProductForm mode="new" categories={categories} />;
}
