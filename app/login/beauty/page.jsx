// app/login/beauty/page.jsx — the Beauty admin login form. Only reachable
// via /login (the panel chooser); the old /beauty/operator/login URL now
// retires straight back to /login instead of rendering a form.
import { redirect } from "next/navigation";
import { getSession } from "@/lib/beauty/operator/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function BeautyLoginPage() {
  const session = await getSession();
  if (session) redirect("/beauty/operator");
  return <LoginForm />;
}
