// app/operator/login/page.jsx — public login (redirects in if already signed in).
import { redirect } from "next/navigation";
import { getSession } from "@/lib/operator/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/operator");
  return <LoginForm />;
}
