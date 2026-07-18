// app/beauty/operator/login/page.jsx — public login (redirects in if already
// signed in with a valid BEAUTY session).
import { redirect } from "next/navigation";
import { getSession } from "@/lib/beauty/operator/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function BeautyLoginPage() {
  const session = await getSession();
  if (session) redirect("/beauty/operator");
  return <LoginForm />;
}
