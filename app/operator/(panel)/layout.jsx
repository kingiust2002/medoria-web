// app/operator/(panel)/layout.jsx — authoritative auth gate for the panel.
// Runs on the Node server, so it can cryptographically verify the session even
// when the Edge middleware can't read the secret. No session → /login/health.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/operator/auth";
import OperatorShell from "@/components/operator/OperatorShell";
import AccountSecurity from "@/components/operator/AccountSecurity";
import { mayView, mayGlobal, restrictedReason, capabilitiesOf } from "@/lib/operator/access";
import { CapabilitiesProvider } from "@/components/panel/Capabilities";
import { menuHrefs, openableTargets } from "@/lib/operator/navAccess";
import { preferencesOf } from "@/lib/operator/preferencesPage";
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
  const allowed = menuHrefs(session, "health");
  const badges = {};
  if (session.user && may("approvals.view")) {
    badges["/operator/approvals"] = await countToReview(getAdminClient(), { actor: session.user, panel: "health" });     // what waits for THIS person
  }
  // pinned shortcuts: only addresses the person can still open (the menu list above is built by the same function)
  const prefs = await preferencesOf(session, "health");
  const byHref = new Map(openableTargets(session, "health").map((x) => [x.href, x]));
  const shortcuts = prefs.shortcuts.map((h) => byHref.get(h)).filter(Boolean);
  return (
    <CapabilitiesProvider value={capabilitiesOf(session, "health")}>
      <OperatorShell allowed={allowed} badges={badges} shortcuts={shortcuts}>{children}</OperatorShell>
    </CapabilitiesProvider>
  );
}
