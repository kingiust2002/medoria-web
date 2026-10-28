// app/beauty/operator/(panel)/layout.jsx — authoritative auth gate for the
// Beauty panel. Runs on the Node server and cryptographically verifies the
// BEAUTY session (its own cookie + secret). No session → the Beauty login.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/beauty/operator/auth";
import OperatorShell from "@/components/beauty/operator/OperatorShell";
import AccountSecurity from "@/components/operator/AccountSecurity";
import { mayView, mayGlobal, restrictedReason, capabilitiesOf } from "@/lib/operator/access";
import { CapabilitiesProvider } from "@/components/panel/Capabilities";
import { menuHrefs, openableTargets } from "@/lib/operator/navAccess";
import { preferencesOf } from "@/lib/operator/preferencesPage";
import { countToReview } from "@/lib/operator/approvals";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { changeMyPassword, startMyTwoStep, confirmMyTwoStep, disableMyTwoStep, newMyRecoveryCodes } from "@/lib/beauty/operator/accountActions";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login/beauty");
  // a temporary password / a required two-step login that is not set up yet: nothing but the person's own security screen opens
  if (restrictedReason(session)) {
    return (
      <OperatorShell allowed={[]}>
        <AccountSecurity mode="setup" user={session.user} actions={{ changeMyPassword, startMyTwoStep, confirmMyTwoStep, disableMyTwoStep, newMyRecoveryCodes }} />
      </OperatorShell>
    );
  }
  // the menu only shows what the person may open (every page and action checks again on the server)
  const may = (rel) => mayView(session, "beauty", rel);
  const allowed = menuHrefs(session, "beauty");
  const badges = {};
  if (session.user && may("approvals.view")) {
    badges["/beauty/operator/approvals"] = await countToReview(getAdminClient(), { actor: session.user, panel: "beauty" });      // what waits for THIS person
  }
  // pinned shortcuts: only addresses the person can still open (the menu list above is built by the same function)
  const prefs = await preferencesOf(session, "beauty");
  const byHref = new Map(openableTargets(session, "beauty").map((x) => [x.href, x]));
  const shortcuts = prefs.shortcuts.map((h) => byHref.get(h)).filter(Boolean);
  return (
    <CapabilitiesProvider value={capabilitiesOf(session, "beauty")}>
      <OperatorShell allowed={allowed} badges={badges} shortcuts={shortcuts}>{children}</OperatorShell>
    </CapabilitiesProvider>
  );
}
