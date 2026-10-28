// app/operator/(panel)/products/page.jsx — product list.
import { getAdminProducts, getAdminCategories } from "@/lib/operator/data";
import ProductsTable from "@/components/operator/ProductsTable";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { PRODUCT_LIST_LIMIT, mayBeTruncated } from "@/lib/operator/listLimits";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  await requireHealthSession("products.view");
  const [products, categories] = await Promise.all([getAdminProducts(), getAdminCategories()]);
  return <ProductsTable products={products} categories={categories} truncatedAt={mayBeTruncated(products, PRODUCT_LIST_LIMIT) ? PRODUCT_LIST_LIMIT : 0} />;
}
