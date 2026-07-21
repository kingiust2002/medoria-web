// app/beauty/[lang]/contact/copy.js — shared (server + client) contact copy.
// Kept out of the "use client" ContactInner so the server page can read it for
// generateMetadata without dotting into a client module.
export const CONTACT_COPY = {
  tg: {
    hero: { tag: "ТАМОС БО MEDORIA BEAUTY", title: "Биёед интихоби навбатии шуморо шакл диҳем", sub: "Бигӯед кадом категория, маҳсулот ё брендро баррасӣ мекунед. Мо имконоти мавҷуда ва қадами баъдиро тасдиқ мекунем." },
    methods: { whatsapp: "Барои саволҳои зуди мол ва мавҷудӣ.", telegram: "Дар Telegram нависед", email: "Барои дархостҳои расмии ҳамкорӣ.", address: "Тоҷикистон" },
    labels: { whatsapp: "WhatsApp", telegram: "Telegram", phone: "Телефон", email: "Email", address: "Суроға" },
    hours: { title: "Соатҳои корӣ", items: [["Душанбе–Ҷумъа", "9:00 – 19:00"], ["Шанбе", "10:00 – 16:00"], ["Якшанбе", "—"]], note: "Дархостҳо дар WhatsApp/Telegram шабонарӯзӣ қабул мешаванд." },
    form: { title: "Фиристодани дархости касбӣ", sub: "Тафсилоти кофӣ диҳед, то даста интихоби шуморо фаҳмад.", name: "Ном", org: "Салон / ташкилот", phone: "Телефон", email: "Email", subject: "Чиро меҷӯед?", message: "Категория, маҳсулот, миқдор ё саволҳо", send: "Фиристодани дархост", sendVia: "Тавассути", viaPhone: "Занг", success: "Дархости шумо омода аст", successSub: "Дар канали интихобшуда идома диҳед, то паёмро фиристед.", another: "Дархости нав оғоз кунед" },
  },
  ru: {
    hero: { tag: "КОНТАКТ MEDORIA BEAUTY", title: "Давайте сформируем ваш следующий отбор", sub: "Расскажите, какие категории, товары или бренды вы рассматриваете. Мы подтвердим доступные варианты и следующий шаг." },
    methods: { whatsapp: "Для быстрых вопросов о товаре и наличии.", telegram: "Напишите в Telegram", email: "Для официальных партнёрских запросов.", address: "Таджикистан" },
    labels: { whatsapp: "WhatsApp", telegram: "Telegram", phone: "Телефон", email: "Email", address: "Адрес" },
    hours: { title: "Часы работы", items: [["Пн–Пт", "9:00 – 19:00"], ["Сб", "10:00 – 16:00"], ["Вс", "—"]], note: "Запросы в WhatsApp/Telegram принимаем круглосуточно." },
    form: { title: "Отправьте профессиональный запрос", sub: "Опишите детали, чтобы команда поняла ваш отбор.", name: "Имя", org: "Салон / организация", phone: "Телефон", email: "Email", subject: "Что вы ищете?", message: "Категории, товары, количество или вопросы", send: "Отправить запрос", sendVia: "Через", viaPhone: "Звонок", success: "Ваш запрос готов", successSub: "Продолжите в выбранном канале, чтобы отправить сообщение.", another: "Начать новый запрос" },
  },
  en: {
    hero: { tag: "CONTACT MEDORIA BEAUTY", title: "Let's shape your next selection", sub: "Tell us which categories, products or brands you are reviewing. We will confirm the available options and the next step." },
    methods: { whatsapp: "For quick product and availability questions.", telegram: "Message us on Telegram", email: "For formal partnership inquiries.", address: "Tajikistan" },
    labels: { whatsapp: "WhatsApp", telegram: "Telegram", phone: "Phone", email: "Email", address: "Address" },
    hours: { title: "Working hours", items: [["Mon–Fri", "9:00 – 19:00"], ["Sat", "10:00 – 16:00"], ["Sun", "—"]], note: "WhatsApp/Telegram requests are accepted around the clock." },
    form: { title: "Send a professional inquiry", sub: "Share enough detail for the team to understand your selection.", name: "Name", org: "Salon / organization", phone: "Phone", email: "Email", subject: "What are you looking for?", message: "Categories, products, quantities or questions", send: "Send inquiry", sendVia: "Send via", viaPhone: "Call", success: "Your inquiry is ready", successSub: "Continue in your selected channel to send the message.", another: "Start another inquiry" },
  },
  fa: {
    hero: { tag: "تماس با مدوریا بیوتی", title: "بیایید انتخاب بعدی شما را شکل دهیم", sub: "بگویید کدام دسته‌بندی، محصول یا برند را بررسی می‌کنید. ما گزینه‌های موجود و قدم بعدی را تأیید می‌کنیم." },
    methods: { whatsapp: "برای سؤالات سریع محصول و موجودی.", telegram: "در تلگرام پیام دهید", email: "برای درخواست‌های رسمی همکاری.", address: "تاجیکستان" },
    labels: { whatsapp: "واتساپ", telegram: "تلگرام", phone: "تلفن", email: "ایمیل", address: "نشانی" },
    hours: { title: "ساعات کاری", items: [["شنبه–چهارشنبه", "۹:۰۰ – ۱۹:۰۰"], ["پنجشنبه", "۱۰:۰۰ – ۱۶:۰۰"], ["جمعه", "—"]], note: "درخواست‌ها در واتساپ/تلگرام شبانه‌روزی پذیرفته می‌شوند." },
    form: { title: "ارسال استعلام حرفه‌ای", sub: "جزئیات کافی ارائه دهید تا تیم انتخاب شما را درک کند.", name: "نام", org: "سالن / سازمان", phone: "تلفن", email: "ایمیل", subject: "دنبال چه هستید؟", message: "دسته‌بندی، محصولات، تعداد یا سؤالات", send: "ارسال استعلام", sendVia: "ارسال از طریق", viaPhone: "تماس", success: "استعلام شما آماده است", successSub: "در کانال انتخابی خود ادامه دهید تا پیام ارسال شود.", another: "شروع استعلام جدید" },
  },
};
