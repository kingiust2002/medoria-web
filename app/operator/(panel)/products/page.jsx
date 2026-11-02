// app/operator/(panel)/products/page.jsx — product list: one server-filtered, server-counted page (state in the address).
import { getProductsPage, getAdminCategories } from "@/lib/operator/data";
import ProductsTable from "@/components/operator/ProductsTable";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { savedViewsOf } from "@/lib/operator/savedViewsPage";
import { columnsOf } from "@/lib/operator/listColumnsPage";
import { preferencesOf } from "@/lib/operator/preferencesPage";
import { defaultSizeOf, withDefaultSize } from "@/lib/operator/listSize";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }) {
  const session = await requireHealthSession("products.view");
  const defaultSize = defaultSizeOf(await preferencesOf(session, "health"), "products");
  const [data, categories, views, columns] = await Promise.all([getProductsPage(withDefaultSize(await searchParams, defaultSize)), getAdminCategories(), savedViewsOf(session, "health", "products"), columnsOf(session, "health", "products")]);
  return <ProductsTable data={data} categories={categories} views={views} columns={columns} defaultSize={defaultSize} />;
}
