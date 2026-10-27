// app/beauty/operator/(panel)/layout.jsx — authoritative auth gate for the
// Beauty panel. Runs on the Node server and cryptographically verifies the
// BEAUTY session (its own cookie + secret). No session → the Beauty login.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/beauty/operator/auth";
import OperatorShell from "@/components/beauty/operator/OperatorShell";
import AccountSecurity from "@/components/operator/AccountSecurity";
import { mayView, mayGlobal, restrictedReason } from "@/lib/operator/access";
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
  const base = "/beauty/operator";
  const allowed = [base, `${base}/settings`];
  if (may("products.view")) allowed.push(`${base}/products`);
  if (may("categories.view") || may("products.view")) allowed.push(`${base}/categories`);
  if (may("brands.view") || may("products.view")) allowed.push(`${base}/brands`);
  if (may("quotes.view")) allowed.push(`${base}/quotes`);
  if (may("audit.view")) allowed.push(`${base}/activity`);
  if (mayGlobal(session, "beauty", "users.view")) allowed.push(`${base}/users`);
  const badges = {};
  if (session.user && may("approvals.view")) {
    allowed.push(`${base}/approvals`);
    badges[`${base}/approvals`] = await countToReview(getAdminClient(), { actor: session.user, panel: "beauty" });      // what waits for THIS person
  }
  return <OperatorShell allowed={allowed} badges={badges}>{children}</OperatorShell>;
}
