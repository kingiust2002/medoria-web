// app/beauty/operator/(panel)/products/new/page.jsx
import { getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductForm from "@/components/beauty/operator/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const categories = await getAdminBeautyCategories();
  return <ProductForm mode="new" categories={categories} />;
}
