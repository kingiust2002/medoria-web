// app/operator/(panel)/products/page.jsx — product list: one server-filtered, server-counted page (state in the address).
import { getProductsPage, getAdminCategories } from "@/lib/operator/data";
import ProductsTable from "@/components/operator/ProductsTable";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { savedViewsOf } from "@/lib/operator/savedViewsPage";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }) {
  const session = await requireHealthSession("products.view");
  const [data, categories, views] = await Promise.all([getProductsPage(await searchParams), getAdminCategories(), savedViewsOf(session, "health", "products")]);
  return <ProductsTable data={data} categories={categories} views={views} />;
}
