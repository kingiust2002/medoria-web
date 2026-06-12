// components/shared/MathCaptcha.jsx — themed human-check for public forms.
// Renders a server-issued math question (lib/actions/captcha.js); the parent
// form sends { token, answer } with the submission and the server action does
// the authoritative verification — this component is UX only, not the gate.
"use client";
import { useCallback, useEffect, useState } from "react";
import { newCaptchaChallenge } from "@/lib/actions/captcha";

const COPY = {
  fa: { label: "بررسی امنیتی", ph: "پاسخ", refresh: "سؤال جدید", loading: "…", failed: "بارگیری نشد — دوباره تلاش کنید", wrong: "پاسخ نادرست است. دوباره تلاش کنید.", rate: "درخواست‌های زیاد است؛ کمی بعد دوباره امتحان کنید." },
  tg: { label: "Санҷиши амниятӣ", ph: "Ҷавоб", refresh: "Саволи нав", loading: "…", failed: "Бор нашуд — боз кӯшиш кунед", wrong: "Ҷавоб нодуруст аст. Боз кӯшиш кунед.", rate: "Дархостҳо аз ҳад зиёданд; баъдтар кӯшиш кунед." },
  ru: { label: "Проверка безопасности", ph: "Ответ", refresh: "Новый вопрос", loading: "…", failed: "Не загрузилось — попробуйте ещё раз", wrong: "Неверный ответ. Попробуйте ещё раз.", rate: "Слишком много запросов — попробуйте позже." },
  en: { label: "Security check", ph: "Answer", refresh: "New question", loading: "…", failed: "Couldn't load — try again", wrong: "Incorrect answer. Please try again.", rate: "Too many requests — please try again shortly." },
};

// Localized text for submit-time failures (used by the parent forms too).
export function captchaErrorText(lang, code) {
  const t = COPY[lang] || COPY.en;
  return code === "rate_limited" ? t.rate : t.wrong;
}

export default function MathCaptcha({ lang = "en", value, onChange, resetKey = 0, invalid = false }) {
  const t = COPY[lang] || COPY.en;
  const [question, setQuestion] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | failed

  const load = useCallback(async () => {
    setState("loading");
    setQuestion(null);
    onChange?.({ token: "", answer: "" });
    try {
      const res = await newCaptchaChallenge();
      if (res?.ok) {
        setQuestion(res.question);
        onChange?.({ token: res.token, answer: "" });
        setState("ready");
      } else {
        setState("failed");
      }
    } catch {
      setState("failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load, resetKey]);

  return (
    <div>
      <label className="block text-[11px] font-semibold text-ink mb-1.5">
        {t.label} <span className="text-warn">*</span>
      </label>
      <div
        className={[
          "flex items-center gap-2.5 rounded-xl border bg-canvas-soft/70 backdrop-blur-sm px-3 py-2",
          invalid ? "border-warn/60" : "border-line",
        ].join(" ")}
      >
        <span
          dir="ltr"
          className="inline-flex items-center justify-center min-w-[84px] h-9 px-3 rounded-lg bg-surface border border-line text-[14px] font-bold text-ink tabular select-none shadow-soft"
          aria-live="polite"
        >
          {state === "ready" ? question : state === "loading" ? t.loading : "—"}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          maxLength={4}
          required
          disabled={state !== "ready"}
          value={value?.answer || ""}
          onChange={(e) => onChange?.({ token: value?.token || "", answer: e.target.value })}
          placeholder={t.ph}
          aria-label={t.label}
          className="input w-24 text-center tabular disabled:opacity-50"
        />
        <button
          type="button"
          onClick={load}
          aria-label={t.refresh}
          title={t.refresh}
          className="ms-auto w-9 h-9 shrink-0 rounded-lg border border-line bg-surface text-ink-muted hover:text-brand-violet hover:border-brand-violet/40 transition-colors flex items-center justify-center"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <polyline points="21 3 21 9 15 9" />
          </svg>
        </button>
      </div>
      {state === "failed" ? (
        <p className="text-[11px] text-warn mt-1.5">{t.failed}</p>
      ) : null}
    </div>
  );
}
