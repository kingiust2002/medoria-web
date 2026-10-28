// app/beauty/operator/(panel)/layout.jsx — authoritative auth gate for the
// Beauty panel. Runs on the Node server and cryptographically verifies the
// BEAUTY session (its own cookie + secret). No session → the Beauty login.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/beauty/operator/auth";
import OperatorShell from "@/components/beauty/operator/OperatorShell";
import { mayView } from "@/lib/operator/access";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login/beauty");
  // the menu only shows what the person may open (every page and action checks again on the server)
  const may = (rel) => mayView(session, "beauty", rel);
  const base = "/beauty/operator";
  const allowed = [base, `${base}/settings`];
  if (may("products.view")) allowed.push(`${base}/products`);
  if (may("categories.view") || may("products.view")) allowed.push(`${base}/categories`);
  if (may("brands.view") || may("products.view")) allowed.push(`${base}/brands`);
  if (may("quotes.view")) allowed.push(`${base}/quotes`);
  if (may("audit.view")) allowed.push(`${base}/activity`);
  return <OperatorShell allowed={allowed}>{children}</OperatorShell>;
}
