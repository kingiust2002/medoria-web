// app/beauty/operator/(panel)/brands/page.jsx
import { getBeautyBrandsWithCounts } from "@/lib/beauty/operator/data";
import BrandsManager from "@/components/beauty/operator/BrandsManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  await requireBeautySession(["brands.view", "products.view"]);
  const brands = await getBeautyBrandsWithCounts();
  return <BrandsManager brands={brands} />;
}
