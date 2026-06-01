// app/operator/(panel)/products/page.jsx — product list.
import { getAdminProducts, getAdminCategories } from "@/lib/operator/data";
import ProductsTable from "@/components/operator/ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([getAdminProducts(), getAdminCategories()]);
  return <ProductsTable products={products} categories={categories} />;
}
