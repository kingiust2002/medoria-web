// app/operator/(panel)/system/page.jsx — System status (N13): what the app checks itself and what the server's scripts reported. Needs users.view (the main manager and house admins).
import SystemStatus from "@/components/operator/SystemStatus";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { loadSystemStatus } from "@/lib/ops/systemData";
import { confirmAlertReceived } from "@/lib/operator/opsActions";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const session = await requireHealthSession("users.view");
  const data = await loadSystemStatus(session, "health");
  return <SystemStatus data={data} confirmAction={confirmAlertReceived} />;
}
