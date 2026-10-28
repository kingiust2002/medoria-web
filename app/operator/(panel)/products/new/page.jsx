// app/operator/(panel)/products/new/page.jsx
import { readRules } from "@/lib/operator/publishGate";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { getAdminCategories } from "@/lib/operator/data";
import ProductForm from "@/components/operator/ProductForm";
import { requireHealthSession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireHealthSession("products.create");
  const rules = await readRules(getAdminClient(), "health");
  const categories = await getAdminCategories();
  return <ProductForm mode="new" categories={categories} publishRules={rules.state === "ok" ? rules.rules : []} publishRulesUnavailable={rules.state === "error"} />;
}
