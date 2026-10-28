"use client";
// "Download CSV" for a warehouse report. The server checks inventory.export and logs the export; the text already carries its BOM.
import { useState } from "react";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";

export default function CsvButton({ run, label, testId = "wh-csv" }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    const res = await run().catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(t(res?.error) || t("ذخیره نشد. دوباره تلاش کنید.")); return; }
    const url = URL.createObjectURL(new Blob([res.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = res.filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (res.truncated) setErr(t("فقط ۵۰۰۰ ردیف اول خروجی گرفته شد."));
  }
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button type="button" className="btn-ghost size-sm" onClick={go} disabled={busy} data-testid={testId}>{busy ? <Spinner /> : <Icon name="download" size={16} />} {label || t("دانلود CSV")}</button>
      {err && <span role="alert" className="text-xs text-warn">{err}</span>}
    </span>
  );
}
