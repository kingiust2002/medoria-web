// app/beauty/operator/(panel)/products/page.jsx — Beauty product list.
import { getAdminBeautyProducts, getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductsTable from "@/components/beauty/operator/ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }) {
  const [products, categories] = await Promise.all([getAdminBeautyProducts(), getAdminBeautyCategories()]);
  const initialQuery = typeof searchParams?.brand === "string" ? searchParams.brand.slice(0, 120) : "";
  return <ProductsTable products={products} categories={categories} initialQuery={initialQuery} />;
}
