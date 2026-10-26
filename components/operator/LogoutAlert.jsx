"use client";
// Shown when a logout did not complete (the server could not end the session). Shared by both panels' shells and
// settings buttons. The panel stays open underneath: the user retries or dismisses it.
import Icon from "@/components/shared/Icon";

export default function LogoutAlert({ message, onRetry, onClose, busy = false, inline = false }) {
  if (!message) return null;
  return (
    <div role="alert" className={`${inline ? "mt-3" : "fixed top-3 inset-x-3 sm:inset-x-auto sm:end-4 sm:w-[26rem] z-[70] shadow-lg"} rounded-xl border border-warn/30 bg-surface p-3 text-sm`} dir="rtl">
      <p className="flex items-start gap-2 text-warn leading-relaxed"><Icon name="alertTriangle" size={16} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{message}</span></p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} disabled={busy} className="btn-primary size-sm disabled:opacity-60">تلاش دوباره</button>
        {onClose && <button type="button" onClick={onClose} className="btn-ghost size-sm">بستن</button>}
      </div>
    </div>
  );
}
