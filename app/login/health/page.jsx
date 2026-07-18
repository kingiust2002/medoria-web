// app/login/health/page.jsx — the Health admin login form. Only reachable
// via /login (the panel chooser); the old /operator/login URL now retires
// straight back to /login instead of rendering a form.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/operator/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/operator");
  return <LoginForm />;
}
