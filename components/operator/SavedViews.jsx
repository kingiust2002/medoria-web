"use client";
// components/operator/SavedViews.jsx — the person's own saved filters of a list (N9), shared by the product and request lists of both panels.
// Applying a view is only a navigation to the list's address with the stored filters; saving keeps the filters on screen under a name; a view is
// per person, so `views === null` (the old shared login, no person) shows nothing. The server cleans and checks everything again.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shared/Icon";
import { Input, Select } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";
import { cleanViewParams, viewHref, VIEW_LIMITS } from "@/lib/operator/savedViews";

const sameFilters = (a, b) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
};

export default function SavedViews({ list, basePath, params, views: initial, actions }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [views, setViews] = useState(initial ?? []);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState(null);
  useEffect(() => { setViews(initial ?? []); }, [initial]);

  const current = useMemo(() => cleanViewParams(list, params), [list, params]);
  const hasFilters = Object.keys(current).length > 0;
  const active = views.find((v) => sameFilters(cleanViewParams(list, v.params), current)) || null;
  if (initial === null || initial === undefined) return null;

  function apply(id) {
    const v = views.find((x) => x.id === id);
    startTransition(() => router.push(v ? viewHref(list, basePath, v.params) : basePath));
  }
  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await actions.save(list, name, current).catch(() => null);
      if (!res) { setMsg(t("ارتباط با سرور برقرار نشد.")); return; }
      if (!res.ok) { setMsg(t(res.error)); return; }
      setViews((vs) => [...vs, res.view]);
      setNaming(false); setName("");
      router.refresh();
    });
  }
  function remove() {
    if (!active) return;
    setMsg(null);
    startTransition(async () => {
      const res = await actions.remove(list, active.id).catch(() => null);
      if (!res) { setMsg(t("ارتباط با سرور برقرار نشد.")); return; }
      if (!res.ok) { setMsg(t(res.error)); return; }
      setViews((vs) => vs.filter((v) => v.id !== active.id));
      router.push(basePath);
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="saved-views">
      <Select value={active?.id || ""} onChange={(e) => apply(e.target.value)} disabled={pending || (!views.length && !active)} className="w-auto min-w-[150px] max-w-full" aria-label={t("نماهای ذخیره‌شده")} data-testid="saved-view-select">
        <option value="">{views.length ? t("نماهای من…") : t("نمایی ذخیره نشده")}</option>
        {views.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </Select>
      {active && <button type="button" onClick={remove} disabled={pending} className="btn-ghost size-sm !text-warn" data-testid="saved-view-delete"><Icon name="trash" size={15} /> {t("حذف نما")}</button>}
      {!active && hasFilters && !naming && views.length < VIEW_LIMITS.perList && (
        <button type="button" onClick={() => { setNaming(true); setMsg(null); }} className="btn-ghost size-sm" data-testid="saved-view-save"><Icon name="plusCircle" size={15} /> {t("ذخیرهٔ این فیلترها")}</button>
      )}
      {naming && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={VIEW_LIMITS.name} placeholder={t("نام نما")} aria-label={t("نام نما")} className="w-44 max-w-full" autoFocus data-testid="saved-view-name" />
          <button type="submit" disabled={pending || !name.trim()} className="btn-primary size-sm disabled:opacity-60" data-testid="saved-view-confirm">{t("ذخیره")}</button>
          <button type="button" onClick={() => { setNaming(false); setName(""); setMsg(null); }} className="btn-ghost size-sm">{t("لغو")}</button>
        </form>
      )}
      {msg && <p role="alert" className="basis-full text-sm text-warn min-w-0 break-words" data-testid="saved-view-error">{msg}</p>}
    </div>
  );
}
