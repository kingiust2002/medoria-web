// app/operator/(panel)/layout.jsx — authoritative auth gate for the panel.
// Runs on the Node server, so it can cryptographically verify the session even
// when the Edge middleware can't read the secret. No session → /login/health.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/operator/auth";
import OperatorShell from "@/components/operator/OperatorShell";
import AccountSecurity from "@/components/operator/AccountSecurity";
import { mayView, mayGlobal, restrictedReason, capabilitiesOf } from "@/lib/operator/access";
import { CapabilitiesProvider } from "@/components/panel/Capabilities";
import { countToReview } from "@/lib/operator/approvals";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { changeMyPassword, startMyTwoStep, confirmMyTwoStep, disableMyTwoStep, newMyRecoveryCodes } from "@/lib/operator/accountActions";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login/health");
  // a temporary password / a required two-step login that is not set up yet: nothing but the person's own security screen opens
  if (restrictedReason(session)) {
    return (
      <OperatorShell allowed={[]}>
        <AccountSecurity mode="setup" user={session.user} actions={{ changeMyPassword, startMyTwoStep, confirmMyTwoStep, disableMyTwoStep, newMyRecoveryCodes }} />
      </OperatorShell>
    );
  }
  // the menu only shows what the person may open (every page and action checks again on the server)
  const may = (rel) => mayView(session, "health", rel);
  const allowed = ["/operator", "/operator/settings"];
  if (may("products.view")) allowed.push("/operator/products");
  if (may("categories.view") || may("products.view")) allowed.push("/operator/categories");
  if (may("quotes.view")) allowed.push("/operator/quotes");
  if (may("inventory.view")) allowed.push("/operator/warehouse");
  if (may("audit.view")) allowed.push("/operator/activity");
  if (mayGlobal(session, "health", "users.view")) allowed.push("/operator/users");
  const badges = {};
  if (session.user && may("approvals.view")) {
    allowed.push("/operator/approvals");
    badges["/operator/approvals"] = await countToReview(getAdminClient(), { actor: session.user, panel: "health" });     // what waits for THIS person
  }
  return (
    <CapabilitiesProvider value={capabilitiesOf(session, "health")}>
      <OperatorShell allowed={allowed} badges={badges}>{children}</OperatorShell>
    </CapabilitiesProvider>
  );
}
