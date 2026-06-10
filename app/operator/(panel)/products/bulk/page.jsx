// app/operator/(panel)/products/bulk/page.jsx — fast multi-product entry.
// Protected like every (panel) route: the layout verifies the operator session.
import { getAdminCategories } from "@/lib/operator/data";
import BulkAddGrid from "@/components/operator/BulkAddGrid";

export const dynamic = "force-dynamic";

export default async function BulkAddPage() {
  const categories = await getAdminCategories();
  return <BulkAddGrid categories={categories} />;
}
