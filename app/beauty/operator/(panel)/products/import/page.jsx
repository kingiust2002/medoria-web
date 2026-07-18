// app/beauty/operator/(panel)/products/import/page.jsx — Excel/CSV import.
// Protected like every (panel) route: the layout verifies the session.
import { getImportLogs } from "@/lib/beauty/operator/importEngine";
import ImportWizard from "@/components/beauty/operator/ImportWizard";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const logs = await getImportLogs(8);
  return <ImportWizard recentLogs={logs} />;
}
