// app/beauty/operator/(panel)/products/new/page.jsx
import { getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductForm from "@/components/beauty/operator/ProductForm";

export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }) {
  const categories = await getAdminBeautyCategories();
  const initialBrand = typeof searchParams?.brand === "string" ? searchParams.brand.slice(0, 120) : "";
  return <ProductForm mode="new" categories={categories} initialBrand={initialBrand} />;
}
