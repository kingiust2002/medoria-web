// app/beauty/operator/(panel)/products/page.jsx — Beauty product list.
import { getAdminBeautyProducts, getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductsTable from "@/components/beauty/operator/ProductsTable";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { PRODUCT_LIST_LIMIT, mayBeTruncated } from "@/lib/operator/listLimits";

export const dynamic = "force-dynamic";

export default async function ProductsPage(props) {
  await requireBeautySession("products.view");
  const searchParams = await props.searchParams;
  const [products, categories] = await Promise.all([getAdminBeautyProducts(), getAdminBeautyCategories()]);
  const initialQuery = typeof searchParams?.brand === "string" ? searchParams.brand.slice(0, 120) : "";
  return <ProductsTable products={products} categories={categories} initialQuery={initialQuery} truncatedAt={mayBeTruncated(products, PRODUCT_LIST_LIMIT) ? PRODUCT_LIST_LIMIT : 0} />;
}
