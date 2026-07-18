// app/operator/(panel)/layout.jsx — authoritative auth gate for the panel.
// Runs on the Node server, so it can cryptographically verify the session even
// when the Edge middleware can't read the secret. No session → /login/health.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/operator/auth";
import OperatorShell from "@/components/operator/OperatorShell";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }) {
  const session = await getSession();
  if (!session) redirect("/login/health");
  return <OperatorShell>{children}</OperatorShell>;
}
