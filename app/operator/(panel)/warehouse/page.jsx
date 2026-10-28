// app/operator/(panel)/warehouse/page.jsx — the internal warehouse (never public). Needs inventory.view.
import WarehouseManager from "@/components/operator/warehouse/WarehouseManager";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { loadWarehouse } from "@/lib/warehouse/pageData";
import { STOCK_UNAVAILABLE } from "@/lib/warehouse/core";

export const dynamic = "force-dynamic";

export default async function WarehousePage({ searchParams }) {
  await requireHealthSession("inventory.view");
  const admin = getAdminClient();
  const data = admin ? await loadWarehouse(admin, "health", await searchParams) : { ok: false, error: STOCK_UNAVAILABLE };
  return <WarehouseManager data={data} />;
}
