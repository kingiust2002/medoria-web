// app/beauty/[lang]/contact/copy.js — shared (server + client) contact copy.
// Kept out of the "use client" ContactInner so the server page can read it for
// generateMetadata without dotting into a client module.
export const CONTACT_COPY = {
  tg: {
    hero: { tag: "ТАМОС", title: "Биёед ҳамкориро оғоз кунем", sub: "Самтҳо ва брендҳои лозимаро нависед — прайс-лист, намунаҳо ва шартҳои махсусро мефиристем." },
    methods: { whatsapp: "Ҷавоби зуд дар WhatsApp", telegram: "Дар Telegram нависед", email: "Мукотибаи расмӣ", address: "Тоҷикистон" },
    labels: { whatsapp: "WhatsApp", telegram: "Telegram", phone: "Телефон", email: "Email", address: "Суроға" },
    hours: { title: "Соатҳои корӣ", items: [["Душанбе–Ҷумъа", "9:00 – 19:00"], ["Шанбе", "10:00 – 16:00"], ["Якшанбе", "—"]], note: "Дархостҳо дар WhatsApp/Telegram шабонарӯзӣ қабул мешаванд." },
    form: { title: "Дархости худро фиристед", sub: "Форматро пур кунед — зуд ҷавоб медиҳем.", name: "Ном", org: "Салон / ташкилот", phone: "Телефон", email: "Email", subject: "Мавзӯъ", message: "Паём", send: "Фиристодан", sendVia: "Тавассути", viaPhone: "Занг", success: "Ташаккур! Паёми шумо омода аст.", successSub: "Пас аз пахши тугма чат бо мо кушода мешавад.", another: "Паёми нав" },
  },
  ru: {
    hero: { tag: "КОНТАКТ", title: "Давайте начнём сотрудничество", sub: "Напишите нужные направления и бренды — пришлём прайс-лист, образцы и особые условия." },
    methods: { whatsapp: "Быстрый ответ в WhatsApp", telegram: "Напишите в Telegram", email: "Официальная переписка", address: "Таджикистан" },
    labels: { whatsapp: "WhatsApp", telegram: "Telegram", phone: "Телефон", email: "Email", address: "Адрес" },
    hours: { title: "Часы работы", items: [["Пн–Пт", "9:00 – 19:00"], ["Сб", "10:00 – 16:00"], ["Вс", "—"]], note: "Запросы в WhatsApp/Telegram принимаем круглосуточно." },
    form: { title: "Отправьте запрос", sub: "Заполните форму — быстро ответим.", name: "Имя", org: "Салон / организация", phone: "Телефон", email: "Email", subject: "Тема", message: "Сообщение", send: "Отправить", sendVia: "Через", viaPhone: "Звонок", success: "Спасибо! Ваше сообщение готово.", successSub: "После нажатия откроется чат с нами.", another: "Новое сообщение" },
  },
  en: {
    hero: { tag: "CONTACT", title: "Let's start a partnership", sub: "Tell us the worlds and brands you need — we'll send the price list, samples and special terms." },
    methods: { whatsapp: "Fast reply on WhatsApp", telegram: "Message us on Telegram", email: "Formal correspondence", address: "Tajikistan" },
    labels: { whatsapp: "WhatsApp", telegram: "Telegram", phone: "Phone", email: "Email", address: "Address" },
    hours: { title: "Working hours", items: [["Mon–Fri", "9:00 – 19:00"], ["Sat", "10:00 – 16:00"], ["Sun", "—"]], note: "WhatsApp/Telegram requests are accepted around the clock." },
    form: { title: "Send your request", sub: "Fill in the form — we'll reply quickly.", name: "Name", org: "Salon / organization", phone: "Phone", email: "Email", subject: "Subject", message: "Message", send: "Send", sendVia: "Send via", viaPhone: "Call", success: "Thank you! Your message is ready.", successSub: "A chat with us opens after you tap the button.", another: "Send another" },
  },
  fa: {
    hero: { tag: "تماس", title: "بیایید همکاری را آغاز کنیم", sub: "دنیاها و برندهای موردنیاز را بنویسید — پرایس‌لیست، نمونه‌ها و شرایط ویژه را می‌فرستیم." },
    methods: { whatsapp: "پاسخ سریع در واتساپ", telegram: "در تلگرام پیام دهید", email: "مکاتبه رسمی", address: "تاجیکستان" },
    labels: { whatsapp: "واتساپ", telegram: "تلگرام", phone: "تلفن", email: "ایمیل", address: "نشانی" },
    hours: { title: "ساعات کاری", items: [["شنبه–چهارشنبه", "۹:۰۰ – ۱۹:۰۰"], ["پنجشنبه", "۱۰:۰۰ – ۱۶:۰۰"], ["جمعه", "—"]], note: "درخواست‌ها در واتساپ/تلگرام شبانه‌روزی پذیرفته می‌شوند." },
    form: { title: "درخواست خود را بفرستید", sub: "فرم را پر کنید — سریع پاسخ می‌دهیم.", name: "نام", org: "سالن / سازمان", phone: "تلفن", email: "ایمیل", subject: "موضوع", message: "پیام", send: "ارسال", sendVia: "ارسال از طریق", viaPhone: "تماس", success: "ممنون! پیام شما آماده است.", successSub: "پس از زدن دکمه، گفتگو با ما باز می‌شود.", another: "پیام جدید" },
  },
};
