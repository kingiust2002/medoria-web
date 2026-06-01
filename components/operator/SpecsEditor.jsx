"use client";
import Icon from "@/components/shared/Icon";

// rows: [{ key, value }]; onChange(rows)
export default function SpecsEditor({ rows, onChange }) {
  const list = rows && rows.length ? rows : [{ key: "", value: "" }];
  const update = (i, field, v) => onChange(list.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  const add = () => onChange([...list, { key: "", value: "" }]);
  const remove = (i) => {
    const next = list.filter((_, idx) => idx !== i);
    onChange(next.length ? next : [{ key: "", value: "" }]);
  };

  return (
    <div className="flex flex-col gap-2">
      {list.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={r.key} onChange={(e) => update(i, "key", e.target.value)} placeholder="ویژگی (مثلاً جنس)" className="input flex-1 min-w-0" />
          <input value={r.value} onChange={(e) => update(i, "value", e.target.value)} placeholder="مقدار (مثلاً نیتریل)" className="input flex-1 min-w-0" />
          <button type="button" onClick={() => remove(i)} className="grid place-items-center w-9 h-9 rounded-lg text-ink-faint hover:bg-warn/10 hover:text-warn shrink-0" aria-label="حذف ردیف">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="btn-ghost size-sm self-start mt-1"><Icon name="plus" size={16} /> افزودن ویژگی</button>
    </div>
  );
}
