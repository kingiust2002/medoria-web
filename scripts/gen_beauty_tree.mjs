// scripts/gen_beauty_tree.mjs
// Source of truth for the Beauty 3-level category tree (7 departments →
// groups → leaves), in all four locales (tg / ru / en / fa). Running this
// emits migrations/12_beauty_category_tree.sql (idempotent, safe re-run).
//
//   node = L(slug, tg, ru, en, fa, children?, icon?)
// Depth = level. A node with no children is a leaf (products attach here).
// Icons are Lucide names already in components/shared/Icon.jsx; leaves omit
// the icon (the UI shows a subtle marker).
import { writeFileSync } from "node:fs";

const L = (slug, tg, ru, en, fa, children = null, icon = null) => ({ slug, tg, ru, en, fa, children, icon });

const TREE = [
  // ── 1) عطر ────────────────────────────────────────────────────────────────
  L("perfume", "Атру атриёт", "Парфюмерия", "Perfume & Fragrance", "عطر", [
    L("perfume-cologne", "Атру одеколон", "Духи и одеколон", "Perfume & Cologne", "عطر و ادکلن"),
    L("perfume-men", "Атри мардона", "Мужская парфюмерия", "Men's Perfume", "عطر و ادکلن مردانه"),
    L("perfume-women", "Атри занона", "Женская парфюмерия", "Women's Perfume", "عطر و ادکلن زنانه"),
    L("perfume-unisex", "Атри унисекс", "Парфюмерия унисекс", "Unisex Perfume", "عطر و ادکلن زنانه و مردانه"),
    L("perfume-kids", "Атри кӯдакона", "Детская парфюмерия", "Kids' Perfume", "عطر و ادکلن بچگانه"),
    L("air-freshener", "Хушбӯйкунандаи ҳаво", "Освежитель воздуха", "Air Freshener", "خوشبوکننده هوا"),
    L("perfume-gift-set", "Маҷмӯаи тӯҳфагии атр", "Подарочный набор парфюма", "Perfume Gift Set", "کیف ست عطر"),
    L("body-mist", "Хушбӯйкунандаи бадан", "Спрей для тела", "Body Mist", "خوشبوکننده بدن"),
    L("perfume-spray", "Атрпош", "Спрей", "Spray", "اسپری"),
    L("body-splash", "Оби хушбӯи бадан", "Боди-сплэш", "Body Splash", "بادی اسپلش"),
    L("fragrances", "Атриёт", "Ароматы", "Fragrances", "عطریات"),
  ], "wind"),

  // ── 2) بهداشتی ────────────────────────────────────────────────────────────
  L("personal-care", "Маҳсулоти беҳдоштӣ", "Гигиена и уход", "Personal Care", "بهداشتی", [
    L("face-care", "Нигоҳубини рӯй", "Уход за лицом", "Face Care", "مراقبت از صورت", [
      L("day-cream", "Кремии рӯзона", "Дневной крем", "Day Cream", "کرم روز"),
      L("night-cream", "Кремии шабона", "Ночной крем", "Night Cream", "کرم شب"),
      L("eye-cream", "Кремии атрофи чашм", "Крем для век", "Eye Cream", "کرم دور چشم"),
      L("exfoliator", "Лоядоракунанда", "Эксфолиант", "Exfoliator", "لایه‌بردار"),
      L("anti-aging", "Зидди пирӣ ва афтидагӣ", "Антивозрастной уход", "Anti-Aging & Firming", "ضد چروک و ضد افتادگی"),
      L("brightening", "Зидди доғ ва равшанкунанда", "Против пигментации", "Anti-Blemish & Brightening", "ضد لک و روشن‌کننده"),
      L("mask-scrub", "Ниқоб ва скраб", "Маски и скрабы", "Masks & Scrubs", "ماسک و اسکراب"),
      L("acne-pore", "Табобати ҷӯш ва манфаз", "Против акне и пор", "Acne & Pore Care", "درمان جوش و منافذ باز"),
      L("cleanser", "Тозакунанда ва шӯянда", "Очищающие средства", "Cleansers", "پاک‌کننده و شوینده"),
      L("face-serum", "Серуми пӯст", "Сыворотка для лица", "Facial Serum", "سرم پوست"),
      L("moisturizer", "Намноккунанда", "Увлажняющее средство", "Moisturizer", "مرطوب‌کننده"),
      L("facial-mist", "Спрейи об", "Термальная вода", "Facial Mist", "اسپری آب"),
      L("sunscreen", "Зидди офтоб", "Солнцезащитный крем", "Sunscreen", "ضد آفتاب"),
      L("tanning", "Маҳсулоти офтобӣ ва автозагар", "Загар и автозагар", "Sun & Self-Tan", "محصولات آفتاب و اتو برنز"),
      L("lash-brow-care", "Нигоҳубини мижа ва абрӯ", "Уход за ресницами и бровями", "Lash & Brow Care", "مراقبت از مژه و ابرو"),
      L("lip-care", "Нигоҳубини лаб", "Уход за губами", "Lip Care", "مراقبت از لب"),
      L("face-scrub", "Скраби рӯй", "Скраб для лица", "Face Scrub", "اسکراب صورت"),
      L("face-mask", "Ниқоби рӯй", "Маска для лица", "Face Mask", "ماسک صورت"),
      L("nose-strips", "Тасмаи бинӣ", "Полоски для носа", "Nose Strips", "چسب بینی"),
    ], "sparkles"),
    L("body-care", "Нигоҳубини бадан", "Уход за телом", "Body Care", "مراقبت از بدن", [
      L("womens-care", "Маҳсулоти занона", "Женская гигиена", "Women's Care", "محصولات بانوان"),
      L("body-wash", "Шӯяндаи бадан", "Гель для душа", "Body Wash", "شوینده بدن"),
      L("body-lotion", "Лосиони бадан", "Лосьон для тела", "Body Lotion", "لوسیون بدن"),
      L("deodorant", "Дезодорант ва хушбӯйкунанда", "Дезодорант", "Deodorant", "دئودورانت و خوشبوکننده"),
      L("sanitizer", "Дезинфексиякунанда", "Антисептик", "Sanitizer", "ضدعفونی‌کننده"),
      L("body-oil", "Равғани бадан", "Масло для тела", "Body Oil", "روغن بدن"),
      L("pain-relief", "Зидди дард, сӯхтагӣ ва илтиҳоб", "Против боли и воспаления", "Pain & Burn Relief", "ضد درد، سوختگی و التهاب"),
      L("wet-wipes", "Дастмоли тар", "Влажные салфетки", "Wet Wipes", "دستمال مرطوب"),
      L("body-cream", "Кремии бадан", "Крем для тела", "Body Cream", "کرم بدن"),
      L("menstrual-cup", "Косаи ҳайз", "Менструальная чаша", "Menstrual Cup", "کاپ قاعدگی"),
      L("cotton-buds", "Гӯшпоккунак", "Ватные палочки", "Cotton Buds", "گوش‌پاک‌کن"),
      L("hand-wash", "Моеъи дастшӯӣ", "Жидкое мыло", "Hand Wash", "مایع دستشویی"),
      L("hand-mask", "Ниқоби даст", "Маска для рук", "Hand Mask", "ماسک دست"),
      L("foot-mask", "Ниқоби пой", "Маска для ног", "Foot Mask", "ماسک پا"),
    ], "droplet"),
    L("oral-care", "Беҳдошти даҳон ва дандон", "Гигиена полости рта", "Oral Care", "بهداشت دهان و دندان", [
      L("toothbrush", "Чӯткаи дандон", "Зубная щётка", "Toothbrush", "مسواک"),
      L("toothpaste", "Хамираи дандон", "Зубная паста", "Toothpaste", "خمیردندان"),
      L("mouthwash", "Даҳоншӯй", "Ополаскиватель", "Mouthwash", "دهان‌شویه"),
      L("dental-floss", "Ресмони дандон", "Зубная нить", "Dental Floss", "نخ دندان"),
      L("interdental-brush", "Чӯткаи байнидандонӣ", "Межзубный ёршик", "Interdental Brush", "براش بین‌دندانی"),
      L("tongue-cleaner", "Забонпоккунак", "Скребок для языка", "Tongue Cleaner", "زبان‌پاک‌کن"),
    ], "sparkles"),
    L("shaving", "Ислоҳи рӯй ва бадан", "Бритьё и депиляция", "Shaving & Hair Removal", "اصلاح صورت و بدن", [
      L("wax", "Вакс", "Воск", "Wax", "وکس"),
      L("depilatory", "Нӯор ва маҳсулоти мӯбар", "Депиляционные средства", "Depilatories", "نوار و محصولات موبر"),
      L("aftershave", "Маҳсулоти баъд аз ислоҳ", "Средства после бритья", "Aftershave", "محصولات بعد از اصلاح"),
      L("razor", "Теғи ислоҳ", "Бритва", "Razor", "تیغ اصلاح"),
    ], "edit"),
    L("hygiene-sets", "Маҷмӯаи маҳсулоти беҳдоштӣ", "Гигиенические наборы", "Hygiene Sets & Tools", "ست محصولات بهداشتی", [
      L("care-accessories", "Лавозими ёрирасон", "Аксессуары", "Accessories", "لوازم جانبی"),
      L("mask-tools", "Ниқоб ва лавозими корӣ", "Маски и инструменты", "Masks & Tools", "ماسک و لوازم کاربردی"),
      L("surface-sanitizer", "Дезинфексияи сатҳ", "Дезинфекция поверхностей", "Surface Sanitizer", "ضدعفونی‌کننده سطوح"),
      L("skincare-tools", "Асбоби нигоҳубини пӯст", "Инструменты для ухода", "Skincare Tools", "ابزار مراقبت از پوست"),
      L("spa-bath", "Спа ва ҳаммом", "Спа и ванна", "Spa & Bath", "اسپا و حمام"),
    ], "package"),
    L("mens-care", "Маҳсулоти беҳдоштии мардона", "Мужской уход", "Men's Care", "محصولات پوستی و بهداشتی آقایان", [
      L("mens-shaving", "Ислоҳи рӯй ва бадан", "Бритьё для мужчин", "Shaving", "اصلاح صورت و بدن"),
      L("mens-skincare", "Нигоҳубини рӯй ва бадан", "Уход за кожей", "Face & Body Care", "مراقبت از صورت و بدن"),
      L("mens-hair", "Нигоҳубини мӯй", "Уход за волосами", "Hair Care", "مراقبت مو"),
      L("mens-other", "Дигар маҳсулоти беҳдоштӣ", "Прочий уход", "Other Men's Care", "سایر محصولات بهداشتی آقایان"),
    ], "user"),
    L("baby-care", "Маҳсулоти кӯдак ва навзод", "Детская гигиена", "Baby & Infant", "محصولات کودک و نوزاد", [
      L("bottle-pacifier", "Шиша ва эмизак", "Бутылочки и соски", "Bottles & Pacifiers", "شیشه و پستانک"),
      L("baby-bottle", "Шишаи шир", "Детская бутылочка", "Baby Bottle", "شیشه شیر"),
      L("baby-hygiene", "Лавозими беҳдоштии кӯдак", "Детская гигиена", "Baby Hygiene", "لوازم بهداشتی کودک"),
      L("baby-cleaners", "Тозакунандаи лавозими кӯдак", "Средства для мытья", "Baby Item Cleaners", "پاک‌کننده و شوینده لوازم کودک"),
      L("baby-bath", "Лавозими ҳаммоми кӯдак", "Детская ванна", "Baby Bath", "لوازم حمام کودک"),
    ], "heart"),
    L("skin-hair-supplement", "Мукаммали пӯст ва мӯй", "Добавки для кожи и волос", "Skin & Hair Supplements", "مکمل پوست و مو", [
      L("skin-hair-drinks", "Нӯшокӣ ва мукаммалҳои пӯсту мӯй", "Напитки и добавки", "Beauty Drinks & Supplements", "نوشیدنی و مکمل‌های پوست و مو"),
    ], "pill"),
    L("intimate", "Маҳсулоти ҳамсарӣ ва ҷинсӣ", "Интимные товары", "Intimate & Sexual", "محصولات زناشویی و جنسی", [
      L("intimate-gel", "Гелҳои ҳамсарӣ", "Интимные гели", "Intimate Gels", "ژل‌های زناشویی"),
      L("condom", "Кондом", "Презервативы", "Condoms", "کاندوم"),
    ], "heart"),
  ], "droplet"),

  // ── 3) آرایشی ─────────────────────────────────────────────────────────────
  L("makeup", "Маҳсулоти ороишӣ", "Косметика (макияж)", "Makeup", "آرایشی", [
    L("face-makeup", "Ороиши рӯй", "Макияж лица", "Face Makeup", "آرایش صورت", [
      L("concealer", "Пинҳонкунак", "Консилер", "Concealer", "کانسیلر"),
      L("foundation", "Кремпудра", "Тональный крем", "Foundation", "کرم‌پودر"),
      L("face-primer", "Праймери рӯй", "Праймер для лица", "Face Primer", "پرایمر صورت"),
      L("powder", "Пудра ё панкейк", "Пудра", "Powder", "پودر صورت یا پنکیک"),
      L("contour-highlighter", "Контур ва ҳайлайтер", "Контур и хайлайтер", "Contour & Highlighter", "کانتور و هایلایتر"),
      L("setting-spray", "Фиксатори ороиш", "Фиксатор макияжа", "Setting Spray", "فیکساتور آرایش"),
      L("bb-cc-cream", "Кремҳои BB, CC ва DD", "BB, CC и DD кремы", "BB, CC & DD Creams", "کرم‌های BB، CC و DD"),
      L("blush", "Рӯгуна", "Румяна", "Blush", "رژگونه"),
      L("bronzer", "Бронзкунанда", "Бронзатор", "Bronzer", "برنزه‌کننده"),
    ], "star"),
    L("eye-makeup", "Ороиши чашм", "Макияж глаз", "Eye Makeup", "آرایش چشم", [
      L("eye-primer", "Праймери чашм", "Праймер для век", "Eye Primer", "پرایمر چشم"),
      L("eyeshadow", "Сояи чашм", "Тени для век", "Eyeshadow", "سایه چشم"),
      L("eyeliner", "Хатти чашм", "Подводка для глаз", "Eyeliner", "خط چشم"),
      L("eye-pencil", "Медади чашм", "Карандаш для глаз", "Eye Pencil", "مداد چشم"),
      L("mascara", "Туш барои мижа", "Тушь для ресниц", "Mascara", "ریمل"),
    ], "eye"),
    L("brow-makeup", "Ороиши абрӯ", "Макияж бровей", "Brow Makeup", "آرایش ابرو", [
      L("brow-pencil", "Медади абрӯ", "Карандаш для бровей", "Brow Pencil", "مداد ابرو"),
      L("brow-powder", "Сояи абрӯ", "Тени для бровей", "Brow Powder", "سایه ابرو"),
      L("brow-mascara", "Туши абрӯ", "Тушь для бровей", "Brow Mascara", "ریمل ابرو"),
      L("brow-marker", "Маркери абрӯ", "Маркер для бровей", "Brow Marker", "ماژیک ابرو"),
      L("brow-gel", "Гели абрӯ", "Гель для бровей", "Brow Gel", "ژل ابرو"),
    ], "edit"),
    L("lip-makeup", "Ороиши лаб", "Макияж губ", "Lip Makeup", "آرایش لب", [
      L("lip-primer", "Праймери лаб", "Праймер для губ", "Lip Primer", "پرایمر لب"),
      L("lipstick", "Ранги лаб", "Помада", "Lipstick", "رژ لب"),
      L("liquid-lipstick", "Ранги лаби моеъ", "Жидкая помада", "Liquid Lipstick", "رژ لب مایع"),
      L("lip-marker", "Маркери лаб", "Маркер для губ", "Lip Marker", "ماژیک لب"),
      L("lip-liner", "Медади лаб", "Карандаш для губ", "Lip Liner", "مداد لب"),
      L("lip-balm", "Балзами лаб", "Бальзам для губ", "Lip Balm", "بالم لب"),
      L("lip-tint", "Тинти лаб", "Тинт для губ", "Lip Tint", "تینت لب"),
      L("lip-oil", "Равғани лаб", "Масло для губ", "Lip Oil", "روغن لب"),
    ], "heart"),
    L("nail-makeup", "Ороиши нохун", "Маникюр и ногти", "Nail Makeup", "آرایش ناخن", [
      L("nail-polish", "Лок", "Лак для ногтей", "Nail Polish", "لاک"),
      L("base-coat", "Бейси нохун", "База для ногтей", "Base Coat", "بیس ناخن"),
      L("top-coat", "Топкот", "Топовое покрытие", "Top Coat", "تاپ‌کت"),
      L("nail-strengthener", "Мустаҳкамкунандаи нохун", "Укрепитель ногтей", "Nail Strengthener", "تقویت‌کننده ناخن"),
      L("nail-remover", "Локпоккунак", "Жидкость для снятия лака", "Nail Polish Remover", "لاک‌پاک‌کن"),
      L("manicure-tools", "Лавозими маникюр ва педикюр", "Инструменты для маникюра", "Manicure & Pedicure Tools", "لوازم مانیکور و پدیکور"),
      L("cuticle-care", "Маҳсулоти кутикула", "Уход за кутикулой", "Cuticle Care", "محصولات کوتیکول، مانیکور و پدیکور"),
    ], "sparkles"),
    L("makeup-accessories", "Лавозими ёрирасони ороишӣ", "Аксессуары для макияжа", "Makeup Accessories", "لوازم جانبی آرایشی", [
      L("mirror", "Оина", "Зеркало", "Mirror", "آینه"),
      L("sharpener", "Тарош", "Точилка", "Sharpener", "تراش"),
      L("tweezers", "Мӯчина", "Пинцет", "Tweezers", "موچین"),
      L("face-brush", "Фейс браш", "Кисть для лица", "Face Brush", "فیس براش"),
      L("makeup-brush", "Мӯйқалами ороишӣ", "Кисть для макияжа", "Makeup Brush", "براش آرایشی"),
      L("makeup-bag", "Кисаи ороишӣ", "Косметичка", "Makeup Bag", "کیف آرایشی"),
      L("lashes", "Мижа ва часпаки мижа", "Ресницы и клей", "Lashes & Glue", "مژه و چسب مژه"),
      L("blender", "Пад ва блендери ороишӣ", "Спонж и бьютиблендер", "Pad & Blender", "پد و بلندر آرایشی"),
    ], "package"),
    L("makeup-sets", "Маҷмӯаҳои ороишӣ", "Наборы для макияжа", "Makeup Sets", "ست‌های آرایشی", [
      L("cleansing-pad", "Пад ва испанҷи тозакунанда", "Очищающие спонжи", "Cleansing Pads", "پد و اسفنج پاک‌کننده"),
      L("beauty-box", "Бюти-бокс", "Бьюти-бокс", "Beauty Box", "بیوتی باکس"),
      L("makeup-set", "Маҷмӯаи ороишӣ", "Набор для макияжа", "Makeup Set", "ست آرایشی"),
      L("face-set", "Маҷмӯаи ороиши рӯй", "Набор для лица", "Face Set", "ست آرایشی صورت"),
      L("eye-set", "Маҷмӯаи ороиши чашм", "Набор для глаз", "Eye Set", "ست آرایشی چشم"),
      L("lip-set", "Маҷмӯаи ороиши лаб", "Набор для губ", "Lip Set", "ست آرایشی لب"),
      L("nail-set", "Маҷмӯаи ороиши нохун", "Набор для ногтей", "Nail Set", "ست آرایشی ناخن"),
      L("accessory-set", "Маҷмӯаи лавозими ороишӣ", "Набор аксессуаров", "Accessory Set", "ست لوازم آرایشی جانبی"),
    ], "package"),
  ], "sparkles"),

  // ── 4) مو ─────────────────────────────────────────────────────────────────
  L("hair", "Нигоҳубини мӯй", "Уход за волосами", "Hair", "مو", [
    L("hair-care", "Нигоҳубини мӯй", "Уход за волосами", "Hair Care", "مراقبت از مو", [
      L("shampoo", "Шампун", "Шампунь", "Shampoo", "شامپو"),
      L("conditioner", "Нармкунандаи мӯй", "Кондиционер", "Conditioner", "نرم‌کننده مو"),
      L("hair-mask", "Ниқоби мӯй", "Маска для волос", "Hair Mask", "ماسک مو"),
      L("hair-spray", "Спрейи мӯй", "Спрей для волос", "Hair Spray", "اسپری مو"),
      L("hair-lotion", "Лосиони мӯй", "Лосьон для волос", "Hair Lotion", "لوسیون مو"),
      L("hair-serum", "Серуми мӯй", "Сыворотка для волос", "Hair Serum", "سرم مو"),
      L("hair-oil", "Равғани мӯй", "Масло для волос", "Hair Oil", "روغن مو"),
      L("hair-cream", "Кремии мӯй", "Крем для волос", "Hair Cream", "کرم مو"),
      L("hair-strengthener", "Мустаҳкамкунандаи мӯй", "Укрепитель волос", "Hair Strengthener", "تقویت‌کننده مو"),
    ], "sparkles"),
    L("hair-styling", "Ҳолатдиҳии мӯй", "Стайлинг волос", "Hair Styling", "حالت‌دهنده مو", [
      L("hair-gel", "Гели мӯй", "Гель для волос", "Hair Gel", "ژل مو"),
      L("styling-spray", "Спрейи ҳолатдиҳӣ", "Спрей для укладки", "Styling Spray", "اسپری حالت‌دهنده مو"),
      L("hair-mousse", "Мусси мӯй", "Мусс для волос", "Hair Mousse", "موس مو"),
      L("hair-brush", "Бурси мӯй", "Расчёска", "Hair Brush", "برس مو"),
    ], "wind"),
    L("hair-color", "Ранги мӯй ва лавозим", "Окрашивание волос", "Hair Color", "رنگ مو و ملزومات", [
      L("hair-color-kit", "Кити ранги мӯй", "Набор для окрашивания", "Hair Color Kit", "کیت رنگ مو"),
      L("hair-dye", "Ранги мӯй", "Краска для волос", "Hair Dye", "رنگ مو"),
      L("developer", "Оксидан", "Окислитель", "Developer", "اکسیدان"),
      L("bleach", "Деклоре", "Осветлитель", "Bleach", "دکلره"),
      L("color-accessories", "Лавозими ранги мӯй", "Аксессуары для окрашивания", "Coloring Accessories", "لوازم جانبی رنگ مو"),
    ], "edit"),
  ], "star"),

  // ── 5) لوازم برقی ─────────────────────────────────────────────────────────
  L("electrical", "Лавозими барқӣ", "Электроприборы", "Electrical Appliances", "لوازم برقی", [
    L("elec-shaving", "Ислоҳи рӯй ва бадан", "Бритьё и эпиляция", "Shaving & Epilation", "اصلاح صورت و بدن", [
      L("epilator", "Мӯйканак", "Эпилятор", "Epilator", "اپیلاتور"),
      L("electric-threading", "Бандандози барқӣ", "Электрический тридинг", "Electric Threading", "بندانداز برقی"),
      L("hair-clipper", "Мошини ислоҳ", "Машинка для стрижки", "Hair Clipper", "ماشین اصلاح"),
      L("trimmer", "Мӯзани гӯш, бинӣ ва абрӯ", "Триммер", "Nose, Ear & Brow Trimmer", "موزن گوش، بینی و ابرو"),
    ], "edit"),
    L("elec-hair-styling", "Ҳолатдиҳандаҳои барқии мӯй", "Электростайлинг волос", "Electric Hair Styling", "حالت‌دهنده‌های برقی مو", [
      L("hair-dryer", "Сешвор", "Фен", "Hair Dryer", "سشوار"),
      L("hair-straightener", "Утуи мӯй", "Выпрямитель", "Hair Straightener", "اتو مو"),
      L("curling-iron", "Фери мӯй", "Плойка", "Curling Iron", "فر مو"),
      L("hot-brush", "Бурси гармӣ", "Термощётка", "Hot Brush", "برس حرارتی"),
    ], "wind"),
    L("elec-skincare", "Асбоби барқии нигоҳубини пӯст", "Электроприборы для кожи", "Electric Skincare", "ابزار برقی مراقبت از پوست", [
      L("electric-face-brush", "Фейс браши барқӣ", "Электрощётка для лица", "Electric Face Brush", "فیس براش برقی"),
    ], "sparkles"),
    L("elec-nail", "Асбоби барқии нохун", "Электроприборы для ногтей", "Electric Nail Care", "ابزار برقی مراقبت از ناخن", [
      L("manicure-machine", "Дастгоҳи маникюр ва педикюр", "Аппарат для маникюра", "Manicure & Pedicure Machine", "دستگاه مانیکور و پدیکور"),
    ], "settings"),
    L("elec-oral", "Асбоби барқии даҳон ва дандон", "Электроприборы для полости рта", "Electric Oral Care", "ابزار برقی مراقبت از دهان و دندان", [
      L("electric-toothbrush", "Чӯткаи дандони барқӣ", "Электрическая зубная щётка", "Electric Toothbrush", "مسواک برقی"),
      L("toothbrush-head", "Сари иловагии чӯткаи барқӣ", "Насадки для щётки", "Toothbrush Heads", "سری یدک مسواک برقی"),
    ], "sparkles"),
    L("elec-health", "Асбоби саломатӣ", "Приборы для здоровья", "Health Devices", "ابزار سلامت", [
      L("air-purifier", "Дастгоҳи тозакунии ҳаво", "Очиститель воздуха", "Air Purifier", "دستگاه تصفیه هوا"),
    ], "zap"),
  ], "zap"),

  // ── 6) مد و فشن ───────────────────────────────────────────────────────────
  L("fashion", "Мӯд ва фашн", "Мода и фэшн", "Fashion", "مد و فشن", [
    L("womens-accessories", "Аксессуари занона", "Женские аксессуары", "Women's Accessories", "اکسسوری زنانه"),
    L("mens-accessories", "Аксессуари мардона", "Мужские аксессуары", "Men's Accessories", "اکسسوری مردانه"),
  ], "tag"),

  // ── 7) مکمل غذایی و دارویی ────────────────────────────────────────────────
  L("supplements", "Мукаммали ғизоӣ ва доруӣ", "БАДы и добавки", "Dietary Supplements", "مکمل غذایی و دارویی", [
    L("vitamins", "Витамин ва минералҳо", "Витамины и минералы", "Vitamins & Minerals", "ویتامین و مواد معدنی"),
    L("fitness-supplement", "Мукаммали фитнес", "Фитнес-добавки", "Fitness Supplements", "مکمل تناسب اندام"),
    L("sports-supplement", "Мукаммали варзишӣ", "Спортивные добавки", "Sports Supplements", "مکمل ورزشی"),
    L("womens-supplement", "Мукаммали занона", "Женские добавки", "Women's Supplements", "مکمل بانوان"),
    L("kids-supplement", "Мукаммали кӯдакон", "Детские добавки", "Kids' Supplements", "مکمل کودکان"),
    L("mens-supplement", "Мукаммали мардона", "Мужские добавки", "Men's Supplements", "مکمل آقایان"),
    L("supplement-skin-hair", "Мукаммали пӯст ва мӯй", "Добавки для кожи и волос", "Skin & Hair Supplements", "مکمل پوست و مو"),
  ], "pill"),
];

// ── emit ──────────────────────────────────────────────────────────────────
const OLD_SLUGS = ["cleansers", "serums", "moisturizers", "suncare", "face-makeup", "lip-makeup", "eye-makeup", "fragrance", "brushes", "devices"];
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const rows = [];
const seen = new Set();
let count = 0;
const walk = (nodes, level, parentSlug, rootSlug) => {
  nodes.forEach((n, i) => {
    if (seen.has(n.slug)) throw new Error(`duplicate slug: ${n.slug}`);
    seen.add(n.slug);
    const root = level === 1 ? n.slug : rootSlug;
    const parentExpr = level === 1 ? "NULL" : `(SELECT id FROM beauty_categories WHERE slug=${q(parentSlug)})`;
    const iconExpr = n.icon ? q(n.icon) : "NULL";
    rows.push(
      `INSERT INTO beauty_categories (slug, parent_id, level, world, name_tg, name_ru, name_en, name_fa, icon, sort_order, is_active) VALUES\n` +
      `  (${q(n.slug)}, ${parentExpr}, ${level}, ${q(root)}, ${q(n.tg)}, ${q(n.ru)}, ${q(n.en)}, ${q(n.fa)}, ${iconExpr}, ${(i + 1) * 10}, true)\n` +
      `  ON CONFLICT (slug) DO UPDATE SET parent_id=EXCLUDED.parent_id, level=EXCLUDED.level, world=EXCLUDED.world,\n` +
      `    name_tg=EXCLUDED.name_tg, name_ru=EXCLUDED.name_ru, name_en=EXCLUDED.name_en, name_fa=EXCLUDED.name_fa,\n` +
      `    icon=EXCLUDED.icon, sort_order=EXCLUDED.sort_order;`
    );
    count++;
    if (n.children) walk(n.children, level + 1, n.slug, root);
  });
};
walk(TREE, 1, null, null);

const sql = `-- migrations/12_beauty_category_tree.sql
-- Beauty 3-level category tree: department (7) -> group -> leaf, all locales.
-- GENERATED by scripts/gen_beauty_tree.mjs — edit the tree there, not here.
-- Idempotent + safe to re-run. Run once in the Supabase SQL editor.
--
-- Verify after running:
--   SELECT level, COUNT(*) FROM beauty_categories GROUP BY level ORDER BY level;
--   SELECT slug, name_fa FROM beauty_categories WHERE parent_id IS NULL ORDER BY sort_order;

-- ── 1) schema: self-referencing tree ────────────────────────────────────────
ALTER TABLE beauty_categories
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES beauty_categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS level     INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_beauty_categories_parent ON beauty_categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_beauty_categories_level  ON beauty_categories (level);

-- ── 2) retire the old two-level starter seed (only rows with no products) ────
DELETE FROM beauty_categories
  WHERE slug IN (${OLD_SLUGS.map(q).join(", ")})
    AND id NOT IN (SELECT category_id FROM beauty_products WHERE category_id IS NOT NULL);

-- ── 3) the full tree (${count} nodes) — parents before children ──────────────
${rows.join("\n\n")}
`;

writeFileSync(new URL("../migrations/12_beauty_category_tree.sql", import.meta.url), sql);
console.log(`wrote migrations/12_beauty_category_tree.sql — ${count} categories`);
