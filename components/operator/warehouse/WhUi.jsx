"use client";
// components/operator/warehouse/WhUi.jsx — the dialog frame and the error line shared by the warehouse screens.
import Icon from "@/components/shared/Icon";
import { useT } from "@/components/panel/PanelI18n";

export function Modal({ title, onClose, children }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative card p-5 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-auto animate-fade-in min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-lg text-ink min-w-0 break-words">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted shrink-0"><Icon name="close" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Err({ children }) {
  return children ? <div role="alert" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> <span className="min-w-0 break-words">{children}</span></div> : null;
}
