// app/beauty/operator/(panel)/products/[id]/history/page.jsx — the change history of one product (needs products.view)
import { notFound } from "next/navigation";
import { getBeautyProductHistory } from "@/lib/beauty/operator/data";
import ProductHistoryManager from "@/components/beauty/operator/ProductHistoryManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function ProductHistoryPage(props) {
  await requireBeautySession("products.view");
  const params = await props.params;
  const data = await getBeautyProductHistory(params.id);
  if (!data) notFound();
  return <ProductHistoryManager product={data.product} versions={data.versions} unavailable={data.unavailable} />;
}
