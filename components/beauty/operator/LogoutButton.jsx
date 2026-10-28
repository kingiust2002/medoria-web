"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import LogoutAlert from "@/components/operator/LogoutAlert";
import { requestLogout } from "@/lib/operator/logoutClient";
import { useT } from "@/components/panel/PanelI18n";

export default function LogoutButton() {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Leaves only when the server confirms the session ended; otherwise the failure is shown and a retry is offered.
  async function logout() {
    setBusy(true);
    const r = await requestLogout("/api/beauty-operator/logout");
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    router.push("/login/beauty");
    router.refresh();
  }
  return (
    <div>
      <button onClick={logout} disabled={busy} className="btn-ghost size-md !text-warn hover:!border-warn/40 disabled:opacity-60">
        <Icon name="logout" size={18} /> {t("خروج از حساب")}</button>
      <LogoutAlert inline message={error} busy={busy} onRetry={logout} onClose={() => setError("")} />
    </div>
  );
}
