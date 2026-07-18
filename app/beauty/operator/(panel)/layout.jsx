// app/beauty/operator/(panel)/layout.jsx — authoritative auth gate for the
// Beauty panel. Runs on the Node server and cryptographically verifies the
// BEAUTY session (its own cookie + secret). No session → the Beauty login.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/beauty/operator/auth";
import OperatorShell from "@/components/beauty/operator/OperatorShell";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login/beauty");
  return <OperatorShell>{children}</OperatorShell>;
}
