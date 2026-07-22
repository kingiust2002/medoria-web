// app/beauty/operator/(panel)/brands/page.jsx
import { getBeautyBrandsWithCounts, getAdminBeautyProducts } from "@/lib/beauty/operator/data";
import BrandsManager from "@/components/beauty/operator/BrandsManager";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const [brands, products] = await Promise.all([getBeautyBrandsWithCounts(), getAdminBeautyProducts()]);
  return <BrandsManager brands={brands} products={products} />;
}
