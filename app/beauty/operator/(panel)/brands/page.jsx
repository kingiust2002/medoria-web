// app/beauty/operator/(panel)/brands/page.jsx
import { getBeautyBrandsWithCounts, getAdminBeautyProducts } from "@/lib/beauty/operator/data";
import BrandsManager from "@/components/beauty/operator/BrandsManager";
import { requireBeautySession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  await requireBeautySession();
  const [brands, products] = await Promise.all([getBeautyBrandsWithCounts(), getAdminBeautyProducts()]);
  return <BrandsManager brands={brands} products={products} />;
}
