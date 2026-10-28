// app/operator/(panel)/products/page.jsx — product list: one server-filtered, server-counted page (state in the address).
import { getProductsPage, getAdminCategories } from "@/lib/operator/data";
import ProductsTable from "@/components/operator/ProductsTable";
import { requireHealthSession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }) {
  await requireHealthSession("products.view");
  const [data, categories] = await Promise.all([getProductsPage(await searchParams), getAdminCategories()]);
  return <ProductsTable data={data} categories={categories} />;
}
