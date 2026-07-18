// app/beauty/operator/(panel)/products/bulk/page.jsx — fast multi-product
// entry. Protected like every (panel) route: the layout verifies the session.
import { getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import BulkAddGrid from "@/components/beauty/operator/BulkAddGrid";

export const dynamic = "force-dynamic";

export default async function BulkAddPage() {
  const categories = await getAdminBeautyCategories();
  return <BulkAddGrid categories={categories} />;
}
