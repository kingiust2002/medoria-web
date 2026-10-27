// components/panel/Trans.jsx — a translated sentence that has React elements inside it (bold, code, a brand name):
// <Trans t={t} k="فقط لوگوی {official} برند…" values={{ official: <b>…</b> }} />. The sentence is ONE message, so
// translators can move the pieces around; {name} is replaced by values[name]. Works in server and client components.
import { Fragment } from "react";

export default function Trans({ t, k, values = {} }) {
  const text = t(k);
  return (
    <>
      {text.split(/(\{\w+\})/).map((part, i) => {
        const m = /^\{(\w+)\}$/.exec(part);
        return m && m[1] in values ? <Fragment key={i}>{values[m[1]]}</Fragment> : part;
      })}
    </>
  );
}
