// app/beauty/operator/(panel)/products/new/page.jsx
import { readRules } from "@/lib/operator/publishGate";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { getAdminBeautyCategories } from "@/lib/beauty/operator/data";
import ProductForm from "@/components/beauty/operator/ProductForm";
import { requireBeautySession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function NewProductPage(props) {
  await requireBeautySession("products.create");
  const searchParams = await props.searchParams;
  const rules = await readRules(getAdminClient(), "beauty");
  const categories = await getAdminBeautyCategories();
  const initialBrand = typeof searchParams?.brand === "string" ? searchParams.brand.slice(0, 120) : "";
  return <ProductForm mode="new" categories={categories} initialBrand={initialBrand} publishRules={rules.state === "ok" ? rules.rules : []} publishRulesUnavailable={rules.state === "error"} />;
}
