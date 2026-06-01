"use client";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    try { await fetch("/api/operator/logout", { method: "POST" }); } catch {}
    router.push("/operator/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="btn-ghost size-md !text-warn hover:!border-warn/40">
      <Icon name="logout" size={18} /> خروج از حساب
    </button>
  );
}
