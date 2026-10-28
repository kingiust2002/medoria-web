// app/operator/(panel)/layout.jsx — authoritative auth gate for the panel.
// Runs on the Node server, so it can cryptographically verify the session even
// when the Edge middleware can't read the secret. No session → /login/health.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/operator/auth";
import OperatorShell from "@/components/operator/OperatorShell";
import { mayView } from "@/lib/operator/access";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login/health");
  // the menu only shows what the person may open (every page and action checks again on the server)
  const may = (rel) => mayView(session, "health", rel);
  const allowed = ["/operator", "/operator/settings"];
  if (may("products.view")) allowed.push("/operator/products");
  if (may("categories.view") || may("products.view")) allowed.push("/operator/categories");
  if (may("quotes.view")) allowed.push("/operator/quotes");
  if (may("audit.view")) allowed.push("/operator/activity");
  return <OperatorShell allowed={allowed}>{children}</OperatorShell>;
}
