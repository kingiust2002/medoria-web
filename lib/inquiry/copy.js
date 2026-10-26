// lib/inquiry/copy.js — visitor-facing words of the inquiry list, in the four site languages.
// Form labels (name, organization, phone, note, channels, send) reuse the existing quote-modal words.

export const COPY = {
  fa: {
    add: "افزودن به فهرست استعلام", inList: "در فهرست استعلام", view: "مشاهده فهرست", remove: "حذف", full: "فهرست پر است (حداکثر ۳۰ محصول).",
    title: "فهرست استعلام", sub: "چند محصول را با هم استعلام کنید؛ یک درخواست، یک پاسخ.", empty: "فهرست استعلام خالی است.",
    emptySub: "در کاتالوگ روی «افزودن به فهرست استعلام» بزنید تا محصولات این‌جا جمع شوند.", go: "رفتن به کاتالوگ", clear: "پاک‌کردن فهرست",
    qty: "تعداد", products: "محصول", gone: "برخی محصولات دیگر موجود نیستند و از فهرست حذف شدند.", invalid: "فهرست معتبر نیست. صفحه را تازه کنید و دوباره تلاش کنید.",
    nav: "فهرست استعلام", loadError: "بارگذاری فهرست ممکن نشد.",
  },
  ru: {
    add: "Добавить в список запроса", inList: "В списке запроса", view: "Открыть список", remove: "Убрать", full: "Список заполнен (не более 30 товаров).",
    title: "Список запроса", sub: "Запросите несколько товаров сразу: одна заявка, один ответ.", empty: "Список запроса пуст.",
    emptySub: "Нажмите «Добавить в список запроса» в каталоге, и товары соберутся здесь.", go: "В каталог", clear: "Очистить список",
    qty: "Количество", products: "товаров", gone: "Некоторые товары больше недоступны и удалены из списка.", invalid: "Список недействителен. Обновите страницу и попробуйте снова.",
    nav: "Список запроса", loadError: "Не удалось загрузить список.",
  },
  tg: {
    add: "Ба рӯйхати дархост илова кардан", inList: "Дар рӯйхати дархост", view: "Дидани рӯйхат", remove: "Хориҷ", full: "Рӯйхат пур аст (на бештар аз 30 маҳсулот).",
    title: "Рӯйхати дархост", sub: "Якчанд маҳсулотро якҷоя дархост кунед: як дархост, як ҷавоб.", empty: "Рӯйхати дархост холӣ аст.",
    emptySub: "Дар каталог «Ба рӯйхати дархост илова кардан»-ро пахш кунед, то маҳсулот дар ин ҷо ҷамъ шаванд.", go: "Ба каталог", clear: "Тоза кардани рӯйхат",
    qty: "Миқдор", products: "маҳсулот", gone: "Баъзе маҳсулот дигар дастрас нестанд ва аз рӯйхат хориҷ шуданд.", invalid: "Рӯйхат нодуруст аст. Саҳифаро нав кунед ва дубора кӯшиш кунед.",
    nav: "Рӯйхати дархост", loadError: "Боркунии рӯйхат иҷро нашуд.",
  },
  en: {
    add: "Add to inquiry list", inList: "In your inquiry list", view: "View list", remove: "Remove", full: "The list is full (30 products at most).",
    title: "Inquiry list", sub: "Ask about several products at once: one request, one reply.", empty: "Your inquiry list is empty.",
    emptySub: "Press “Add to inquiry list” in the catalog and the products gather here.", go: "Browse catalog", clear: "Clear list",
    qty: "Quantity", products: "products", gone: "Some products are no longer available and were removed from the list.", invalid: "The list is not valid. Refresh the page and try again.",
    nav: "Inquiry list", loadError: "Could not load the list.",
  },
};

export const copyFor = (lang) => COPY[lang] || COPY.en;

// The text sent through WhatsApp / Telegram: a title, one line per product, then the sender.
export function listMessage({ title, lines, name, org, phone, note, url, labels }) {
  return [
    title,
    "",
    ...lines.map((l) => `• ${l.name}${l.sku ? ` (${l.sku})` : ""} × ${l.quantity}`),
    "",
    `👤 ${labels.name}: ${name || "—"}`,
    `🏥 ${labels.org}: ${org || "—"}`,
    `📞 ${labels.phone}: ${phone || "—"}`,
    ...(note ? [`💬 ${note}`] : []),
    ...(url ? ["", `🔗 ${url}`] : []),
  ].join("\n");
}
