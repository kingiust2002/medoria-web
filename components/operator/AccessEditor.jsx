"use client";
// The access editor of the people screen: tick-boxes instead of typed patterns. Choose a ready role, then adjust per person — group by group
// (products, categories, brands, images and media, documents, customer requests, warehouse, site content, reports, history, approvals, users),
// with the real effective state of every option and, where a real approval path exists, "direct" or "needs approval".
//
// This is a convenience: lib/operator/accessCatalog.js (the same pure functions the tests run) turns the ticks into the stored lists, and the server
// checks the whole change again (authz.checkUserChange — delegation ceiling, owners, houses, last owner) whatever this screen sent.
import { useMemo } from "react";   // (render helpers below are plain functions, not nested components: nested components would remount on every keystroke)
import { Badge } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import { tr } from "@/lib/panel/i18n";
import { GLOBAL_ITEMS, NON_DELEGABLE, catalogFor, describePermission, roleDefaults } from "@/lib/operator/accessCatalog";
import { ROLES, approvableFor, can, decide } from "@/lib/operator/authz";
import { OPERATION_LABELS } from "@/lib/operator/userLabels";

const HOUSE_LABEL = { health: tr("سلامت"), beauty: tr("زیبایی") };

// the approval list of a house as the editor sees it: the person's own list when they have one, else the role's
export const approvalFor = ({ role, custom, approval }, house) => (custom?.[house] ? approval?.[house] || [] : ROLES[role]?.approval || []);

export default function AccessEditor({ role, houses, ticks, onTicks, custom, approval, onApproval, actor, locked, onReset }) {
  const t = useT();
  const isOwnerActor = actor.role === "owner";
  const actorUser = useMemo(() => ({ ...actor, status: "active" }), [actor]);
  const roleSet = useMemo(() => roleDefaults({ role, houses }), [role, houses]);
  const has = useMemo(() => new Set(ticks), [ticks]);
  const toggle = (permission, on) => {
    const next = new Set(has);
    if (on) next.add(permission); else next.delete(permission);
    // changing a price is a kind of edit: no edit, no price (the model removes it too; the screen says so instead of surprising anybody)
    const m = permission.match(/^(\w+)\.products\.edit$/);
    if (m && !on) next.delete(`${m[1]}.products.price`);
    if (m && on) next.add(`${m[1]}.products.price`);                  // editing implies the price right (as the model does); untick it to keep prices closed
    const p = permission.match(/^(\w+)\.products\.price$/);
    if (p && on) next.add(`${p[1]}.products.edit`);
    onTicks([...next]);
  };
  const setMode = (house, op, mode) => {
    const list = new Set(approvalFor({ role, custom, approval }, house));
    if (mode === "approval") list.add(op); else list.delete(op);
    onApproval(house, [...list].filter((o) => approvableFor(house).includes(o)));
  };

  const reasonDisabled = (permission) => {
    if (locked) return t("مدیر اصلی همهٔ دسترسی‌ها را دارد و تغییری ندارد.");
    if (isOwnerActor) return "";
    if (NON_DELEGABLE.includes(permission)) return t("فقط مدیر اصلی می‌تواند این دسترسی را بدهد.");
    if (!can(actorUser, permission)) return t("خودتان این دسترسی را ندارید؛ نمی‌توانید آن را به کسی بدهید.");
    return "";
  };

  const renderItem = (item) => {
    const on = has.has(item.permission), fromRole = roleSet.has(item.permission);
    const why = reasonDisabled(item.permission);
    const state = on ? (fromRole ? t("از نقش") : t("اضافه‌شده")) : fromRole ? t("بسته‌شده") : "";
    return (
      <div className="min-w-0" data-testid="access-item" data-permission={item.permission} data-on={on ? "1" : "0"}>
        <label className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm ${why ? "text-ink-faint" : "text-ink"}`}>
          <input type="checkbox" checked={on} disabled={Boolean(why)} onChange={(e) => toggle(item.permission, e.target.checked)} data-testid="access-check" />
          <span className="min-w-0 break-words">{t(item.title)}</span>
          {state && <Badge tone={on ? (fromRole ? "neutral" : "info") : "warn"} data-testid="access-state">{state}</Badge>}
        </label>
        {why && <p className="text-[11px] text-ink-faint ms-6 break-words" data-testid="access-why">{why}</p>}
      </div>
    );
  };

  const renderModes = (house, group) => {
    if (!group.operations.length) return null;
    const list = approvalFor({ role, custom, approval }, house);
    return (
      <div className="mt-2 grid gap-1.5 border-t border-line pt-2" data-testid="access-modes">
        <p className="text-[11px] text-ink-muted">{t("اجرا: مستقیم یا نیازمند تأیید؟")}</p>
        {group.operations.map(({ op, permission }) => {
          const allowed = has.has(permission);
          const mode = !allowed ? "denied" : list.includes(op) ? "approval" : "direct";
          const directBlocked = !isOwnerActor && decide(actorUser, house, op).mode !== "direct";
          return (
            <div key={op} className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0" data-testid="access-mode" data-op={op} data-mode={mode}>
              <span className={`text-xs min-w-0 break-words flex-1 basis-40 ${allowed ? "text-ink-soft" : "text-ink-faint"}`}>{t(OPERATION_LABELS[op] || op)}</span>
              {allowed ? (
                <span className="inline-flex rounded-lg border border-line overflow-hidden text-xs" role="group" aria-label={t(OPERATION_LABELS[op] || op)}>
                  <button type="button" disabled={locked || directBlocked} aria-pressed={mode === "direct"} title={directBlocked ? t("خودتان برای این کار تأیید می‌گیرید؛ نمی‌توانید اجرای مستقیم بدهید.") : undefined}
                    onClick={() => setMode(house, op, "direct")} data-mode-set="direct"
                    className={`px-2.5 py-1 ${mode === "direct" ? "bg-navy text-white" : "text-ink-soft"} disabled:opacity-50`}>{t("مستقیم")}</button>
                  <button type="button" disabled={locked} aria-pressed={mode === "approval"} onClick={() => setMode(house, op, "approval")} data-mode-set="approval"
                    className={`px-2.5 py-1 border-s border-line ${mode === "approval" ? "bg-navy text-white" : "text-ink-soft"} disabled:opacity-50`}>{t("نیازمند تأیید")}</button>
                </span>
              ) : <span className="text-[11px] text-ink-faint">{t("دسترسی ندارد")}</span>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="grid gap-4 min-w-0" data-testid="access-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-ink-soft">{t("دسترسی‌ها")}</p>
        {!locked && <button type="button" className="btn-ghost size-xs" onClick={onReset} data-testid="access-reset">{t("برگرداندن به پیش‌فرض نقش")}</button>}
      </div>
      <p className="text-xs text-ink-muted leading-relaxed">{locked ? t("مدیر اصلی همهٔ دسترسی‌های هر دو بخش را دارد.") : t("هر تیک یعنی «همین حالا می‌تواند». برداشتن تیکی که نقش می‌دهد، آن را برای همین فرد می‌بندد.")}</p>

      {houses.map((house) => (
        <section key={house} className="grid gap-2 min-w-0" aria-label={t(HOUSE_LABEL[house])} data-testid="access-house" data-house={house}>
          <h3 className="text-sm font-semibold text-ink">{t("بخش {house}", { house: t(HOUSE_LABEL[house]) })}</h3>
          {catalogFor(house).map((group) => {
            const total = group.items.length, count = group.items.filter((i) => has.has(i.permission)).length;
            return (
              <details key={group.id} className="rounded-xl border border-line p-3 min-w-0" data-testid="access-group" data-group={group.id}>
                <summary className="cursor-pointer text-sm font-medium text-ink-soft flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words">{t(group.title)}</span>
                  <span className="text-[11px] text-ink-muted tabular" data-testid="access-count">{t("{count} از {total}", { count, total })}</span>
                </summary>
                <div className="grid gap-2 mt-3">
                  {group.items.map((item) => <div key={item.permission} className="min-w-0">{renderItem(item)}</div>)}
                  {renderModes(house, group)}
                </div>
              </details>
            );
          })}
        </section>
      ))}

      <section className="grid gap-2 min-w-0" data-testid="access-users">
        <h3 className="text-sm font-semibold text-ink">{t("کاربران")}</h3>
        <div className="rounded-xl border border-line p-3 grid gap-2">{GLOBAL_ITEMS.map((item) => <div key={item.permission} className="min-w-0">{renderItem(item)}</div>)}</div>
      </section>
    </div>
  );
}

// "Health · Products · Edit price" for the summary
export function permissionText(permission, t) {
  const d = describePermission(permission);
  return [d.house ? t(HOUSE_LABEL[d.house]) : null, t(d.group), t(d.title)].filter(Boolean).join(" · ");
}
export { HOUSE_LABEL };

// The summary shown BEFORE saving: what is added, what is taken away, which operations change between "direct" and "needs approval", houses, role.
export function AccessSummary({ diff, creating, restoring }) {
  const t = useT();
  const modeText = { direct: t("مستقیم"), approval: t("نیازمند تأیید") };
  return (
    <div className="grid gap-3 min-w-0" data-testid="access-summary">
      <p className="text-sm font-medium text-ink">{creating ? t("این دسترسی‌ها داده می‌شود") : restoring ? t("پیش از بازگردانی، این‌ها را بازبینی کنید") : t("پیش از ذخیره، این تغییرها اعمال می‌شود")}</p>
      {diff.empty && <p className="text-sm text-ink-muted" data-testid="summary-empty">{t("در دسترسی‌ها تغییری نیست.")}</p>}
      {diff.roleChanged && <p className="text-xs text-ink-soft">{t("نقش عوض شده است؛ تیک‌ها با پیش‌فرض نقش تازه شروع شده‌اند.")}</p>}
      {(diff.houses.added.length > 0 || diff.houses.removed.length > 0) && (
        <p className="text-sm text-ink-soft break-words" data-testid="summary-houses">
          {diff.houses.added.length > 0 && <span>{t("بخش اضافه می‌شود: {names}", { names: diff.houses.added.map((h) => t(HOUSE_LABEL[h])).join(t("،") + " ") })} </span>}
          {diff.houses.removed.length > 0 && <span>{t("بخش برداشته می‌شود: {names}", { names: diff.houses.removed.map((h) => t(HOUSE_LABEL[h])).join(t("،") + " ") })}</span>}
        </p>
      )}
      {diff.added.length > 0 && (
        <div data-testid="summary-added"><p className="text-[13px] font-medium text-ok">{t("اضافه می‌شود ({count})", { count: diff.added.length })}</p>
          <ul className="grid gap-0.5 mt-1 text-sm text-ink-soft">{diff.added.map((p) => <li key={p} className="break-words" data-permission={p}>+ {permissionText(p, t)}</li>)}</ul></div>
      )}
      {diff.removed.length > 0 && (
        <div data-testid="summary-removed"><p className="text-[13px] font-medium text-warn">{t("برداشته می‌شود ({count})", { count: diff.removed.length })}</p>
          <ul className="grid gap-0.5 mt-1 text-sm text-ink-soft">{diff.removed.map((p) => <li key={p} className="break-words" data-permission={p}>− {permissionText(p, t)}</li>)}</ul></div>
      )}
      {diff.modes.length > 0 && (
        <div data-testid="summary-modes"><p className="text-[13px] font-medium text-ink-soft">{t("تغییر حالت اجرا ({count})", { count: diff.modes.length })}</p>
          <ul className="grid gap-0.5 mt-1 text-sm text-ink-soft">{diff.modes.map((m) => <li key={`${m.house}:${m.op}`} className="break-words" data-op={m.op}>{t(HOUSE_LABEL[m.house])} · {t(OPERATION_LABELS[m.op] || m.op)}: {modeText[m.from]} ← {modeText[m.to]}</li>)}</ul></div>
      )}
    </div>
  );
}
