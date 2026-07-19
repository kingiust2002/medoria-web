// components/shared/AiAssistant.jsx
// Floating, multilingual B2B smart assistant. Streams replies from /api/chat
// (Claude). Theme-aware via semantic tokens, RTL-aware via logical props, and
// motion-aware. When the API has no key it degrades gracefully to a
// WhatsApp/Telegram hand-off. Launcher sits on the start corner — opposite the
// WhatsApp launcher on the end corner.
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { getTranslations } from "@/lib/i18n";
import { TG_USER, waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { requestChatPass } from "@/lib/actions/chatPass";
import MathCaptcha, { captchaErrorText } from "./MathCaptcha";
import Icon from "./Icon";

// One-time human-check copy for the chat gate (keeps bots off the paid model).
const GATE = {
  tg: { title: "Санҷиши кӯтоҳ", sub: "Барои оғози сӯҳбат ба саволи зерин ҷавоб диҳед.", start: "Оғози сӯҳбат", again: "Санҷиш нав шуд — боз ҷавоб диҳед." },
  fa: { title: "بررسی کوتاه", sub: "برای شروع گفتگو به سؤال زیر پاسخ دهید.", start: "شروع گفتگو", again: "بررسی تازه شد — دوباره پاسخ دهید." },
  ru: { title: "Быстрая проверка", sub: "Ответьте на вопрос ниже, чтобы начать чат.", start: "Начать чат", again: "Проверка обновлена — ответьте снова." },
  en: { title: "Quick check", sub: "Answer the question below to start the chat.", start: "Start chat", again: "Check refreshed — please answer again." },
};

const UI = {
  tg: {
    name: "Дастёри Medoria",
    online: "Онлайн • одатан зуд ҷавоб медиҳад",
    hint: "Дастёри ҳушманд",
    intro: "Салом! Ман дастёри Medoria ҳастам. Дар бораи маҳсулот, категорияҳо ё тарзи дархости нарх бипурсед.",
    placeholder: "Чизе бипурсед…",
    suggestions: ["Кадом дастпӯшҳо доред?", "Чӣ тавр нарх пурсам?", "Кадом категорияҳо доред?"],
    send: "Фиристодан",
    fallbackTitle: "Бо дастаи мо мустақим сӯҳбат кунед",
    fallbackText: "Бо мо дар WhatsApp ё Telegram тамос гиред — одатан дар як соат ҷавоб медиҳем.",
    error: "Хатогӣ рух дод. Бори дигар кӯшиш кунед ё дар WhatsApp нависед.",
    disclaimer: "Дастёри AI · нархҳо тавассути WhatsApp/Telegram тасдиқ мешаванд",
  },
  fa: {
    name: "دستیار مدوریا",
    online: "آنلاین • معمولاً سریع پاسخ می‌دهد",
    hint: "دستیار هوشمند",
    intro: "سلام! من دستیار مدوریا هستم. درباره محصولات، دسته‌بندی‌ها یا روش استعلام قیمت بپرسید.",
    placeholder: "هرچه می‌خواهید بپرسید…",
    suggestions: ["چه دستکش‌هایی دارید؟", "چطور قیمت بپرسم؟", "چه دسته‌هایی دارید؟"],
    send: "ارسال",
    fallbackTitle: "مستقیم با تیم ما گفتگو کنید",
    fallbackText: "از طریق واتساپ یا تلگرام با ما در تماس باشید — معمولاً ظرف یک ساعت پاسخ می‌دهیم.",
    error: "خطایی رخ داد. دوباره تلاش کنید یا در واتساپ پیام دهید.",
    disclaimer: "دستیار هوشمند · قیمت‌ها از طریق واتساپ/تلگرام تأیید می‌شوند",
  },
  ru: {
    name: "Ассистент Medoria",
    online: "Онлайн • обычно отвечает быстро",
    hint: "Умный ассистент",
    intro: "Здравствуйте! Я ассистент Medoria. Спросите о товарах, категориях или как запросить цену.",
    placeholder: "Спросите что угодно…",
    suggestions: ["Какие перчатки есть?", "Как запросить цену?", "Какие категории есть?"],
    send: "Отправить",
    fallbackTitle: "Свяжитесь с нашей командой напрямую",
    fallbackText: "Напишите нам в WhatsApp или Telegram — обычно отвечаем в течение часа.",
    error: "Произошла ошибка. Попробуйте снова или напишите в WhatsApp.",
    disclaimer: "AI-ассистент · цены подтверждаются через WhatsApp/Telegram",
  },
  en: {
    name: "Medoria Assistant",
    online: "Online • usually replies fast",
    hint: "Smart assistant",
    intro: "Hi! I'm the Medoria assistant. Ask me about products, categories, or how to request a quote.",
    placeholder: "Ask anything…",
    suggestions: ["What gloves do you have?", "How do I request a price?", "Which categories do you offer?"],
    send: "Send",
    fallbackTitle: "Chat with our team directly",
    fallbackText: "Reach us on WhatsApp or Telegram — we usually reply within an hour.",
    error: "Something went wrong. Please try again or reach us on WhatsApp.",
    disclaimer: "AI assistant · prices confirmed via WhatsApp/Telegram",
  },
};

function Dots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-brand-violet/70 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

// `endpoint` + `ui` are parametrized so the Beauty vertical can reuse this
// exact widget against /api/beauty-chat with its own copy (defaults keep
// Health's behavior byte-for-byte).
export default function AiAssistant({ lang, endpoint = "/api/chat", ui = UI }) {
  const t = ui[lang] || ui.en;
  const g = GATE[lang] || GATE.en;
  const tc = getTranslations(lang).common;
  const reduce = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(null); // null=unknown, true, false
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [errored, setErrored] = useState(false);

  // Human gate: a chat pass (obtained by solving one captcha) is required
  // before any message reaches the paid model. Kept in memory for the session.
  const [pass, setPass] = useState(null);
  const [captcha, setCaptcha] = useState({ token: "", answer: "" });
  const [captchaReset, setCaptchaReset] = useState(0);
  const [gateError, setGateError] = useState(null);
  const [verifying, setVerifying] = useState(false);

  async function unlock(e) {
    e?.preventDefault?.();
    if (verifying) return;
    setVerifying(true);
    setGateError(null);
    try {
      const res = await requestChatPass({ captchaToken: captcha.token, captchaAnswer: captcha.answer });
      if (res?.ok && res.pass) {
        setPass(res.pass);
        inputRef.current?.focus();
      } else {
        setGateError(captchaErrorText(lang, res?.error === "rate_limited" ? "rate_limited" : "captcha"));
        setCaptchaReset((k) => k + 1);
      }
    } catch {
      setGateError(captchaErrorText(lang, "captcha"));
      setCaptchaReset((k) => k + 1);
    } finally {
      setVerifying(false);
    }
  }

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Probe availability the first time the panel opens.
  useEffect(() => {
    if (!open || available !== null) return;
    let live = true;
    fetch(endpoint)
      .then((r) => r.json())
      .then((d) => live && setAvailable(!!d.available))
      .catch(() => live && setAvailable(false));
    return () => { live = false; };
  }, [open, available, endpoint]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, open, available]);

  // Focus the input when the chat opens and is usable.
  useEffect(() => {
    if (open && available) inputRef.current?.focus();
  }, [open, available]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    async (raw) => {
      const text = (raw ?? "").trim();
      if (!text || streaming) return;
      if (!pass) return; // gate not cleared yet — the captcha panel is showing
      setErrored(false);
      setInput("");
      const next = [...messages, { role: "user", content: text }];
      setMessages([...next, { role: "assistant", content: "" }]);
      setStreaming(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, lang, pass }),
        });
        if (res.status === 503) {
          setAvailable(false);
          setMessages(messages); // roll back the optimistic turns
          return;
        }
        if (res.status === 401) {
          // Pass expired or invalid → drop it and re-show the captcha gate.
          setPass(null);
          setCaptchaReset((k) => k + 1);
          setMessages(messages); // roll back the optimistic turns
          setInput(text);        // let the visitor resend after re-verifying
          return;
        }
        if (!res.ok || !res.body) throw new Error("bad response");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const c = m.slice();
            c[c.length - 1] = { role: "assistant", content: acc };
            return c;
          });
        }
        if (!acc.trim()) throw new Error("empty");
      } catch {
        setErrored(true);
        setMessages((m) => {
          const c = m.slice();
          c[c.length - 1] = { role: "assistant", content: t.error, error: true };
          return c;
        });
      } finally {
        setStreaming(false);
      }
    },
    [messages, streaming, lang, t.error, endpoint, pass]
  );

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const panelMotion = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 24, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: 16, scale: 0.97 },
        transition: { type: "spring", stiffness: 260, damping: 26 },
      };

  const showFallback = available === false;

  return (
    <>
      {/* ── Launcher (start corner, opposite WhatsApp) ──────────────────── */}
      <div className="fixed z-[55] bottom-[4.75rem] start-4 md:bottom-6 md:start-6">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={t.hint}
          aria-expanded={open}
          className="group relative h-14 w-14 rounded-full bg-brand-gradient shadow-brand text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          {!reduce && !open && (
            <span className="absolute inset-0 rounded-full bg-brand-gradient opacity-60 animate-ping" style={{ animationDuration: "2.4s" }} />
          )}
          <span className="relative">
            <Icon name={open ? "close" : "sparkles"} size={24} strokeWidth={2} />
          </span>
          {/* Hover tooltip (desktop) */}
          <span className="pointer-events-none absolute start-full ms-3 hidden md:block whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-canvas opacity-0 translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0">
            {t.hint}
          </span>
        </button>
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            {...panelMotion}
            role="dialog"
            aria-label={t.name}
            dir={lang === "fa" ? "rtl" : "ltr"}
            className="fixed z-[60] flex flex-col overflow-hidden rounded-3xl border border-line bg-surface/95 backdrop-blur-2xl shadow-2xl
                       inset-x-3 top-3 bottom-3
                       md:inset-auto md:bottom-6 md:start-6 md:h-[600px] md:max-h-[calc(100dvh-3rem)] md:w-[380px]"
          >
            {/* Header */}
            <div className="relative bg-brand-gradient text-white px-4 py-3.5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                <Icon name="sparkles" size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display font-bold text-[15px] leading-tight truncate">{t.name}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-white/85">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,0.9)]" />
                  <span className="truncate">{t.online}</span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
              >
                <Icon name="close" size={18} strokeWidth={2} />
              </button>
            </div>

            {showFallback ? (
              /* Graceful no-key fallback → hand off to messaging channels */
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 px-6">
                <div className="h-14 w-14 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center">
                  <Icon name="chat" size={26} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-ink text-lg">{t.fallbackTitle}</h3>
                  <p className="text-sm text-ink-muted mt-1.5 leading-relaxed">{t.fallbackText}</p>
                </div>
                <div className="w-full flex flex-col gap-2 mt-1">
                  <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-md w-full">
                    <Icon name="chat" size={16} /> {tc.whatsapp}
                  </a>
                  <a href={`https://t.me/${TG_USER}`} target="_blank" rel="noopener noreferrer" className="btn-tg size-md w-full">
                    <Icon name="send" size={16} /> {tc.telegram}
                  </a>
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto bg-canvas px-3.5 py-4 flex flex-col gap-3">
                  {/* Greeting + suggestions (only before the first message) */}
                  {messages.length === 0 && (
                    <div className="flex flex-col gap-3">
                      <div className="self-start max-w-[88%] rounded-2xl bg-surface border border-line text-ink px-3.5 py-2.5 text-sm leading-relaxed">
                        {t.intro}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {t.suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => send(s)}
                            disabled={available === null || !pass}
                            className="text-xs px-3 py-1.5 rounded-full border border-line bg-surface text-ink-muted hover:text-brand-violet hover:border-brand-violet/40 transition-colors disabled:opacity-50"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((m, i) => {
                    const isUser = m.role === "user";
                    const isEmptyAssistant = !isUser && !m.content;
                    return (
                      <div
                        key={i}
                        className={`max-w-[88%] whitespace-pre-wrap text-sm leading-relaxed px-3.5 py-2.5 rounded-2xl ${
                          isUser
                            ? "self-end bg-brand-gradient text-white shadow-brand"
                            : m.error
                            ? "self-start bg-rose-500/10 border border-rose-500/30 text-ink"
                            : "self-start bg-surface border border-line text-ink"
                        }`}
                      >
                        {isEmptyAssistant ? <Dots /> : m.content}
                      </div>
                    );
                  })}
                </div>

                {/* Human gate: solve one captcha to unlock the session. */}
                {available && !pass ? (
                  <form onSubmit={unlock} className="border-t border-line bg-surface px-3.5 pt-3 pb-3">
                    <div className="flex items-center gap-2 mb-2 text-ink">
                      <span className="grid place-items-center w-7 h-7 rounded-lg bg-brand-violet/10 text-brand-violet shrink-0">
                        <Icon name="shield" size={15} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-tight">{g.title}</div>
                        <div className="text-[11px] text-ink-muted leading-tight">{g.sub}</div>
                      </div>
                    </div>
                    <MathCaptcha lang={lang} value={captcha} onChange={setCaptcha} resetKey={captchaReset} invalid={Boolean(gateError)} />
                    {gateError && <p role="alert" className="text-[11px] text-warn mt-2">{gateError}</p>}
                    <button
                      type="submit"
                      disabled={verifying || !captcha.answer}
                      className="btn-primary size-md w-full mt-2.5 disabled:opacity-60"
                    >
                      <Icon name={verifying ? "refresh" : "chat"} size={15} className={verifying ? "animate-spin" : ""} />
                      {g.start}
                    </button>
                  </form>
                ) : (
                <div className="border-t border-line bg-surface px-3 pt-2.5 pb-2">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={t.placeholder}
                      disabled={streaming || available === null || !pass}
                      className="flex-1 resize-none max-h-28 bg-canvas border border-line rounded-xl px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:border-brand-violet/50 focus:ring-2 focus:ring-brand-violet/15 disabled:opacity-60"
                    />
                    <button
                      onClick={() => send(input)}
                      disabled={!input.trim() || streaming}
                      aria-label={t.send}
                      className="shrink-0 h-10 w-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-brand hover:scale-105 active:scale-95 transition-transform disabled:opacity-40 disabled:hover:scale-100"
                    >
                      <Icon name="send" size={17} strokeWidth={2} className={lang === "fa" ? "-scale-x-100" : ""} />
                    </button>
                  </div>
                  <p className="text-[10px] text-ink-muted/80 text-center mt-1.5">{t.disclaimer}</p>
                </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
