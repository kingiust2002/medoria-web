// app/beauty/operator/(panel)/brands/page.jsx
import { getBeautyBrandsWithCounts } from "@/lib/beauty/operator/data";
import BrandsManager from "@/components/beauty/operator/BrandsManager";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const brands = await getBeautyBrandsWithCounts();
  return <BrandsManager brands={brands} />;
}
