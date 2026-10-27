"use client";
// "Download CSV" of the filtered activity log. The server checks audit.export and logs the export; this only turns the text into a file.
import { useState } from "react";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";

export default function AuditExportButton({ filters, exportAction }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr("");
    const res = await exportAction(filters).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید.")); return; }
    const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = res.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button type="button" className="btn-ghost size-sm" onClick={run} disabled={busy} data-testid="audit-export">{busy ? <Spinner /> : <Icon name="download" size={16} />} {t("دانلود CSV")}</button>
      {err && <span role="alert" className="text-xs text-warn">{err}</span>}
    </div>
  );
}
