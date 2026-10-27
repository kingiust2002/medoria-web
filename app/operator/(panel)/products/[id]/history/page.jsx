// app/operator/(panel)/products/[id]/history/page.jsx — the change history of one product (needs products.view)
import { notFound } from "next/navigation";
import { getProductHistory } from "@/lib/operator/data";
import ProductHistoryManager from "@/components/operator/ProductHistoryManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function ProductHistoryPage(props) {
  await requireHealthSession("products.view");
  const params = await props.params;
  const data = await getProductHistory(params.id);
  if (!data) notFound();
  return <ProductHistoryManager product={data.product} versions={data.versions} unavailable={data.unavailable} />;
}
