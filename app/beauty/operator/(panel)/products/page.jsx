// app/beauty/operator/(panel)/products/page.jsx — Beauty product list.
import { getAdminBeautyProducts, getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductsTable from "@/components/beauty/operator/ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([getAdminBeautyProducts(), getAdminBeautyCategories()]);
  return <ProductsTable products={products} categories={categories} />;
}
