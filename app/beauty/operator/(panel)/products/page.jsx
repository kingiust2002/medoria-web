// app/beauty/operator/(panel)/products/page.jsx — Beauty product list: one server-filtered, server-counted page (state in the address).
import { getBeautyProductsPage, getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductsTable from "@/components/beauty/operator/ProductsTable";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { savedViewsOf } from "@/lib/operator/savedViewsPage";

export const dynamic = "force-dynamic";

export default async function ProductsPage(props) {
  const session = await requireBeautySession("products.view");
  const sp = { ...(await props.searchParams) };
  if (!sp.q && typeof sp.brand === "string") sp.q = sp.brand;           // a link from the brands screen
  const [data, categories, views] = await Promise.all([getBeautyProductsPage(sp), getAdminBeautyCategories(), savedViewsOf(session, "beauty", "products")]);
  return <ProductsTable data={data} categories={categories} views={views} />;
}
