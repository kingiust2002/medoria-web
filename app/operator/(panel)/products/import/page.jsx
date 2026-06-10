// app/operator/(panel)/products/import/page.jsx — Excel/CSV product import.
// Protected like every (panel) route: the layout verifies the operator session.
import { getImportLogs } from "@/lib/operator/importEngine";
import ImportWizard from "@/components/operator/ImportWizard";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const logs = await getImportLogs(8);
  return <ImportWizard recentLogs={logs} />;
}
