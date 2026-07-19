// components/beauty/BeautyAiAssistant.jsx — the shared AiAssistant widget,
// pointed at /api/beauty-chat and dressed in Beauty copy. It renders inside the
// data-vertical="beauty" scope (from the Beauty layout), so the widget's
// brand-gradient / brand-violet accents automatically wear the nude-copper-navy
// palette — no visual fork needed.
"use client";
import AiAssistant from "@/components/shared/AiAssistant";

// Quiet, considered register per the Master Copy Deck §5 (professional beauty
// for salons, boutiques and specialists) — no medical wording, no emojis.
const BEAUTY_UI = {
  tg: {
    name: "Дастёри Medoria Beauty",
    online: "Онлайн • одатан зуд ҷавоб медиҳад",
    hint: "Дастёри ҳушманд",
    intro: "Салом! Ман дастёри Medoria Beauty ҳастам. Дар бораи маҳсулот, самтҳо ё тарзи дархости нарх бипурсед.",
    placeholder: "Чизе бипурсед…",
    suggestions: ["Кадом самтҳо доред?", "Чӣ тавр нарх пурсам?", "Барои салон чӣ пешниҳод мекунед?"],
    send: "Фиристодан",
    fallbackTitle: "Бо дастаи мо мустақим сӯҳбат кунед",
    fallbackText: "Бо мо дар WhatsApp ё Telegram тамос гиред.",
    error: "Хатогӣ рух дод. Бори дигар кӯшиш кунед ё дар WhatsApp нависед.",
    disclaimer: "Дастёри AI · нархҳо тавассути WhatsApp/Telegram тасдиқ мешаванд",
  },
  fa: {
    name: "دستیار مدوریا بیوتی",
    online: "آنلاین • معمولاً سریع پاسخ می‌دهد",
    hint: "دستیار هوشمند",
    intro: "سلام! من دستیار مدوریا بیوتی هستم. درباره محصولات، دسته‌ها یا روش استعلام قیمت بپرسید.",
    placeholder: "هرچه می‌خواهید بپرسید…",
    suggestions: ["چه دسته‌هایی دارید؟", "چطور قیمت بپرسم؟", "برای سالن چه پیشنهادی دارید؟"],
    send: "ارسال",
    fallbackTitle: "مستقیم با تیم ما گفتگو کنید",
    fallbackText: "از طریق واتساپ یا تلگرام با ما در تماس باشید.",
    error: "خطایی رخ داد. دوباره تلاش کنید یا در واتساپ پیام دهید.",
    disclaimer: "دستیار هوشمند · قیمت‌ها از طریق واتساپ/تلگرام تأیید می‌شوند",
  },
  ru: {
    name: "Ассистент Medoria Beauty",
    online: "Онлайн • обычно отвечает быстро",
    hint: "Умный ассистент",
    intro: "Здравствуйте! Я ассистент Medoria Beauty. Спросите о товарах, категориях или как запросить цену.",
    placeholder: "Спросите что угодно…",
    suggestions: ["Какие категории есть?", "Как запросить цену?", "Что посоветуете для салона?"],
    send: "Отправить",
    fallbackTitle: "Свяжитесь с нашей командой напрямую",
    fallbackText: "Напишите нам в WhatsApp или Telegram.",
    error: "Произошла ошибка. Попробуйте снова или напишите в WhatsApp.",
    disclaimer: "AI-ассистент · цены подтверждаются через WhatsApp/Telegram",
  },
  en: {
    name: "Medoria Beauty Assistant",
    online: "Online • usually replies fast",
    hint: "Smart assistant",
    intro: "Hi! I'm the Medoria Beauty assistant. Ask me about products, categories, or how to request pricing.",
    placeholder: "Ask anything…",
    suggestions: ["Which categories do you offer?", "How do I request pricing?", "What do you suggest for a salon?"],
    send: "Send",
    fallbackTitle: "Chat with our team directly",
    fallbackText: "Reach us on WhatsApp or Telegram.",
    error: "Something went wrong. Please try again or reach us on WhatsApp.",
    disclaimer: "AI assistant · prices confirmed via WhatsApp/Telegram",
  },
};

export default function BeautyAiAssistant({ lang }) {
  return <AiAssistant lang={lang} endpoint="/api/beauty-chat" ui={BEAUTY_UI} />;
}
