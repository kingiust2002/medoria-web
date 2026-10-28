// app/beauty/operator/(panel)/approvals/page.jsx — the approval queue: what colleagues asked for (to review) and what I asked for (status).
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { getPanel } from "@/lib/panel/server";
import { PageHeader } from "@/components/operator/ui";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { approvalsView } from "@/lib/operator/approvalActionsCore";
import ApprovalsManager from "@/components/operator/ApprovalsManager";
import { approveRequestAction, rejectRequestAction, cancelRequestAction, resubmitRequestAction } from "@/lib/beauty/operator/approvalActions";

export const dynamic = "force-dynamic";

export default async function BeautyApprovalsPage({ searchParams }) {
  const { t } = await getPanel();
  const session = await requireBeautySession("approvals.view");
  const sp = (await searchParams) || {};
  const view = await approvalsView({ admin: getAdminClient(), session, panel: "beauty" });
  return (
    <>
      <PageHeader title={t("تأییدها")} subtitle={t("تغییرهایی که پیش از اعمال به تأیید نیاز دارند")} />
      <ApprovalsManager
        toReview={view.ok ? view.toReview : []} mine={view.ok ? view.mine : []} loadError={view.ok ? "" : view.error} sent={sp.sent === "1"}
        actions={{ approve: approveRequestAction, reject: rejectRequestAction, cancel: cancelRequestAction, resubmit: resubmitRequestAction }}
      />
    </>
  );
}
