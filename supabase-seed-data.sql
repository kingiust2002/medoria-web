-- ════════════════════════════════════════════════════════════════════════
-- Medoria — Seed Data
-- Run AFTER both migration files
-- This populates the catalog with 24 realistic products across all 6 categories
-- ════════════════════════════════════════════════════════════════════════

-- Make sku unique so re-running this file doesn't duplicate
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_sku_key') THEN
    ALTER TABLE products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;
END $$;

-- ── Categories table ────────────────────────────────────────────────────
INSERT INTO categories (slug, name_ru, name_tg, name_en, name_fa, description_ru, sort_order, icon) VALUES
  ('gloves',      'Перчатки',         'Дастпӯш',       'Gloves',          'دستکش',         'Нитриловые, латексные, виниловые',     1, 'gloves'),
  ('masks',       'Маски и защита',   'Ниқоб ва ҳифоз', 'Masks & Protection','ماسک و محافظت', 'Маски, респираторы, защита',         2, 'mask'),
  ('instruments', 'Инструменты',      'Асбобҳо',       'Instruments',     'ابزار پزشکی',    'Хирургические и расходные',           3, 'stethoscope'),
  ('wound',       'Перевязочные',     'Бандубаст',     'Wound Care',      'زخم‌بندی',       'Бинты, пластыри, антисептики',        4, 'bandage'),
  ('diagnostics', 'Диагностика',      'Ташхис',        'Diagnostics',     'تشخیص',          'Тонометры, термометры, тесты',        5, 'thermometer'),
  ('lab',         'Лаборатория',      'Лаборатория',   'Lab Supplies',    'آزمایشگاهی',     'Пробирки, реактивы, расходники',      6, 'flask')
ON CONFLICT (slug) DO UPDATE SET
  name_ru = EXCLUDED.name_ru, name_tg = EXCLUDED.name_tg,
  name_en = EXCLUDED.name_en, name_fa = EXCLUDED.name_fa,
  description_ru = EXCLUDED.description_ru, sort_order = EXCLUDED.sort_order;

-- ── 24 Realistic products ───────────────────────────────────────────────
INSERT INTO products (sku, category, brand, price, unit, min_order_qty, in_stock, badge, is_featured,
                      name_ru, name_tg, name_en, name_fa,
                      description_ru, description_tg, description_en, description_fa) VALUES

-- GLOVES (4)
('GLV-001', 'gloves', 'MediCare', 8.50, '× 100', 1, true, 'TOP', true,
  'Перчатки нитриловые смотровые, размер M',
  'Дастпӯши нитрилии муоинавӣ, андозаи M',
  'Nitrile examination gloves, size M',
  'دستکش نیتریل معاینه، سایز M',
  'Смотровые перчатки из нитрила без пудры. Гипоаллергенные, прочные. Упаковка 100 шт.',
  'Дастпӯши муоинавӣ аз нитрил бе хока. Зидди аллергия, мустаҳкам. Бастаи 100 дона.',
  'Powder-free nitrile examination gloves. Hypoallergenic, durable. Pack of 100.',
  'دستکش معاینه نیتریل بدون پودر. ضد حساسیت، بادوام. بسته ۱۰۰ تایی.'),

('GLV-002', 'gloves', 'MediCare', 8.50, '× 100', 1, true, 'TOP', true,
  'Перчатки нитриловые смотровые, размер L',
  'Дастпӯши нитрилии муоинавӣ, андозаи L',
  'Nitrile examination gloves, size L',
  'دستکش نیتریل معاینه، سایز L',
  'Размер L. Без пудры, гипоаллергенные. Упаковка 100 шт.',
  'Андозаи L. Бе хока, зидди аллергия. Бастаи 100 дона.',
  'Size L. Powder-free, hypoallergenic. Pack of 100.',
  'سایز L. بدون پودر، ضد حساسیت. بسته ۱۰۰ تایی.'),

('GLV-003', 'gloves', 'SafeWear', 12.00, '× 50', 1, true, NULL, false,
  'Перчатки латексные стерильные хирургические, размер 7',
  'Дастпӯши латексии стерилии ҷарроҳӣ, андозаи 7',
  'Sterile surgical latex gloves, size 7',
  'دستکش جراحی لاتکس استریل، سایز ۷',
  'Хирургические стерильные перчатки. Индивидуальная упаковка пар. 50 пар.',
  'Дастпӯши стерилии ҷарроҳӣ. Бастабандии алоҳида. 50 ҷуфт.',
  'Sterile surgical gloves. Individually packed pairs. 50 pairs.',
  'دستکش جراحی استریل. بسته‌بندی جداگانه. ۵۰ جفت.'),

('GLV-004', 'gloves', 'PureCare', 4.90, '× 100', 1, true, 'SALE', false,
  'Перчатки виниловые прозрачные, размер M',
  'Дастпӯши винилии шаффоф, андозаи M',
  'Clear vinyl gloves, size M',
  'دستکش وینیل شفاف، سایز M',
  'Виниловые перчатки для общих задач. Прозрачные, экономичные. 100 шт.',
  'Дастпӯши винилӣ барои корҳои умумӣ. Шаффоф, иқтисодӣ. 100 дона.',
  'Vinyl gloves for general tasks. Clear, economical. Pack of 100.',
  'دستکش وینیل برای کارهای عمومی. شفاف، اقتصادی. ۱۰۰ تایی.'),

-- MASKS (4)
('MSK-001', 'masks', 'SafeWear', 4.20, '× 50', 1, true, 'NEW', true,
  'Маска медицинская 3-слойная одноразовая',
  'Ниқоби тиббии 3-қабатаи якдафъаина',
  '3-ply disposable medical mask',
  'ماسک پزشکی ۳ لایه یکبار مصرف',
  'Защитная медицинская маска с ушными петлями. Носовой зажим. 50 шт.',
  'Ниқоби муҳофизатии тиббӣ бо ҳалқаҳои гӯш. Зажими бинӣ. 50 дона.',
  '3-ply medical mask with ear loops and nose clip. Pack of 50.',
  'ماسک پزشکی ۳ لایه با بند گوش و گیره بینی. بسته ۵۰ تایی.'),

('MSK-002', 'masks', 'BioShield', 18.00, '× 20', 1, true, 'TOP', true,
  'Респиратор FFP2 / N95 без клапана',
  'Респиратори FFP2 / N95 бе клапан',
  'FFP2 / N95 respirator, no valve',
  'رسپیراتور FFP2 / N95 بدون والو',
  'Респиратор класса защиты FFP2. Многослойный фильтр. 20 шт.',
  'Респиратори синфи ҳифзи FFP2. Филтри бисёрқабата. 20 дона.',
  'FFP2 protection class respirator. Multi-layer filter. Pack of 20.',
  'رسپیراتور کلاس FFP2. فیلتر چندلایه. بسته ۲۰ تایی.'),

('MSK-003', 'masks', 'MediCare', 25.00, '× 10', 1, true, NULL, false,
  'Защитный щиток для лица с регулируемым креплением',
  'Сипари рӯй бо банди танзимшаванда',
  'Adjustable face shield',
  'شیلد محافظ صورت قابل تنظیم',
  'Прозрачный защитный экран. Антизапотевающее покрытие. Многоразовый.',
  'Сипари шаффоф. Рӯкаши зидди буғ. Бисёркарата истифода.',
  'Clear face shield with anti-fog coating. Reusable.',
  'شیلد شفاف با پوشش ضدبخار. قابل استفاده مجدد.'),

('MSK-004', 'masks', 'PureCare', 3.50, '× 100', 1, true, NULL, false,
  'Шапочка медицинская одноразовая',
  'Кулоҳчаи тиббии якдафъаина',
  'Disposable medical cap',
  'کلاه پزشکی یکبار مصرف',
  'Одноразовая шапочка-берет на резинке. Нетканый материал. 100 шт.',
  'Кулоҳчаи якдафъаина бо резина. Маводи бофтанашуда. 100 дона.',
  'Disposable bouffant cap. Non-woven material. Pack of 100.',
  'کلاه یکبار مصرف کشدار. پارچه نبافته. بسته ۱۰۰ تایی.'),

-- INSTRUMENTS (5)
('SYR-001', 'instruments', 'MedTech', 0.18, 'pcs', 100, true, NULL, true,
  'Шприц одноразовый 5 мл с иглой',
  'Шприци якдафъаинаи 5мл бо сӯзан',
  '5ml disposable syringe with needle',
  'سرنگ ۵ سی‌سی یکبار مصرف با سوزن',
  'Стерильный одноразовый шприц с иглой 22G. Индивидуальная упаковка.',
  'Шприци стерилии якдафъаина бо сӯзани 22G. Бастабандии алоҳида.',
  'Sterile disposable syringe with 22G needle. Individually packed.',
  'سرنگ استریل یکبار مصرف با سوزن 22G. بسته‌بندی جداگانه.'),

('SYR-002', 'instruments', 'MedTech', 0.12, 'pcs', 100, true, NULL, false,
  'Шприц одноразовый 2 мл с иглой',
  'Шприци якдафъаинаи 2мл бо сӯзан',
  '2ml disposable syringe with needle',
  'سرنگ ۲ سی‌سی یکبار مصرف با سوزن',
  'Шприц 2 мл, игла 23G. Стерильный.',
  'Шприци 2мл, сӯзани 23G. Стерилӣ.',
  '2ml syringe with 23G needle. Sterile.',
  'سرنگ ۲ سی‌سی با سوزن 23G. استریل.'),

('STH-001', 'instruments', 'ClinicPro', 42.00, 'pcs', 1, true, 'NEW', true,
  'Стетоскоп двусторонний для взрослых',
  'Стетоскопи дутарафа барои калонсолон',
  'Adult dual-head stethoscope',
  'استتوسکوپ دو سر بزرگسالان',
  'Профессиональный стетоскоп с двусторонней головкой. Чёрный.',
  'Стетоскопи касбӣ бо сари дутарафа. Сиёҳ.',
  'Professional stethoscope with dual-head chestpiece. Black.',
  'استتوسکوپ حرفه‌ای دو سر. مشکی.'),

('INS-001', 'instruments', 'SteriLab', 6.50, 'pcs', 1, true, NULL, false,
  'Пинцет анатомический 14см, нерж. сталь',
  'Пинцети анатомӣ 14см, пӯлоди зангнопазир',
  'Anatomical tweezers 14cm, stainless steel',
  'پنس آناتومی ۱۴ سانتی استیل',
  'Анатомический пинцет из медицинской нержавеющей стали. Длина 14 см.',
  'Пинцети анатомӣ аз пӯлоди тиббии зангнопазир. Дарозии 14 см.',
  'Anatomical tweezers, surgical stainless steel. 14cm length.',
  'پنس آناتومی استیل پزشکی. طول ۱۴ سانتی‌متر.'),

('INS-002', 'instruments', 'SteriLab', 12.00, 'pcs', 1, true, NULL, false,
  'Ножницы хирургические прямые 15см',
  'Қайчиҳои ҷарроҳии рост 15см',
  'Straight surgical scissors 15cm',
  'قیچی جراحی مستقیم ۱۵ سانتی',
  'Хирургические ножницы из нержавеющей стали. Прямые, 15 см.',
  'Қайчиҳои ҷарроҳӣ аз пӯлоди зангнопазир. Рост, 15 см.',
  'Surgical stainless steel scissors. Straight, 15cm.',
  'قیچی جراحی استیل ضدزنگ. مستقیم، ۱۵ سانتی.'),

-- WOUND CARE (4)
('WND-001', 'wound', 'MediPlus', 2.20, '× 10', 1, true, NULL, true,
  'Бинт марлевый стерильный 7см × 5м',
  'Бинти газагини стерилӣ 7см × 5м',
  'Sterile gauze bandage 7cm × 5m',
  'باند گاز استریل ۷ × ۵۰۰ سانتی',
  'Стерильный медицинский бинт. Ширина 7см, длина 5м. 10 шт. в упаковке.',
  'Бинти стерилии тиббӣ. Бари 7см, дарозии 5м. Бастаи 10 дона.',
  'Sterile medical gauze. 7cm wide, 5m long. Pack of 10.',
  'باند استریل پزشکی. عرض ۷ سانت، طول ۵ متر. بسته ۱۰ تایی.'),

('WND-002', 'wound', 'MediPlus', 5.50, '× 100', 1, true, NULL, false,
  'Лейкопластырь бактерицидный 7,2×1,9см',
  'Лейкопластыри бактерицидӣ 7,2×1,9см',
  'Bactericidal adhesive plaster 7.2×1.9cm',
  'چسب زخم باکتری‌کش ۷٫۲×۱٫۹ سانت',
  'Бактерицидный пластырь телесного цвета. Воздухопроницаемый. 100 шт.',
  'Лейкопластыри бактерицидии ранги пӯст. Ҳавогузар. 100 дона.',
  'Bactericidal flesh-tone plaster. Breathable. Pack of 100.',
  'چسب زخم باکتری‌کش هم‌رنگ پوست. قابل تنفس. ۱۰۰ تایی.'),

('WND-003', 'wound', 'BioShield', 4.80, '× 1L', 1, true, 'NEW', false,
  'Перекись водорода 3% — 1 литр',
  'Перекиси гидроген 3% — 1 литр',
  'Hydrogen peroxide 3% — 1 liter',
  'آب اکسیژنه ۳٪ — یک لیتر',
  'Антисептический раствор для обработки ран. 1 литр.',
  'Маҳлули антисептикӣ барои табобати захм. 1 литр.',
  'Antiseptic solution for wound care. 1 liter.',
  'محلول ضد عفونی برای زخم. ۱ لیتر.'),

('WND-004', 'wound', 'BioShield', 9.50, '× 1L', 1, true, NULL, false,
  'Хлоргексидин биглюконат 0,05% — 1 литр',
  'Хлоргексидини биглюконат 0,05% — 1 литр',
  'Chlorhexidine bigluconate 0.05% — 1 liter',
  'کلرهگزیدین بی‌گلوکونات ۰٫۰۵٪ — یک لیتر',
  'Кожный антисептик широкого спектра. 1 литр.',
  'Антисептики пӯсти доираи васеъ. 1 литр.',
  'Broad-spectrum skin antiseptic. 1 liter.',
  'ضد عفونی پوست با طیف وسیع. ۱ لیتر.'),

-- DIAGNOSTICS (4)
('DGN-001', 'diagnostics', 'VitaMed', 28.00, 'pcs', 1, true, 'TOP', true,
  'Тонометр механический со стетоскопом',
  'Тонометри механикӣ бо стетоскоп',
  'Manual blood pressure monitor with stethoscope',
  'فشارسنج عقربه‌ای با استتوسکوپ',
  'Профессиональный механический тонометр. Прочная манжета на липучке.',
  'Тонометри касбии механикӣ. Манжети сахт бо часпак.',
  'Professional manual sphygmomanometer. Durable velcro cuff.',
  'فشارسنج حرفه‌ای دستی. کاف چسبی بادوام.'),

('DGN-002', 'diagnostics', 'VitaMed', 22.00, 'pcs', 1, true, NULL, true,
  'Термометр инфракрасный бесконтактный',
  'Термометри инфрасурхи беалоқа',
  'Infrared no-contact thermometer',
  'تب‌سنج مادون قرمز بدون تماس',
  'Измерение температуры за 1 секунду. Память на 32 измерения.',
  'Андозагирии ҳарорат дар 1 сония. Хотираи 32 ченакот.',
  '1-second temperature reading. 32-measurement memory.',
  'اندازه‌گیری دما در ۱ ثانیه. حافظه ۳۲ اندازه‌گیری.'),

('DGN-003', 'diagnostics', 'HealthFirst', 15.00, 'pcs', 1, true, NULL, false,
  'Глюкометр + 10 тест-полосок',
  'Глюкометр + 10 тасмаи санҷиш',
  'Glucometer + 10 test strips',
  'گلوکومتر + ۱۰ نوار تست',
  'Стартовый набор глюкометра. Результат за 5 секунд.',
  'Маҷмӯаи ибтидоии глюкометр. Натиҷа дар 5 сония.',
  'Glucometer starter kit. Result in 5 seconds.',
  'پک شروع گلوکومتر. نتیجه در ۵ ثانیه.'),

('DGN-004', 'diagnostics', 'HealthFirst', 9.50, '× 50', 1, true, NULL, false,
  'Тест-полоски для глюкометра, 50 шт.',
  'Тасмаҳои санҷиши глюкометр, 50 дона',
  'Glucometer test strips, 50 pcs',
  'نوار تست گلوکومتر، ۵۰ عددی',
  'Тест-полоски для определения глюкозы. Совместимы с моделями HealthFirst.',
  'Тасмаҳои муайянкунии глюкоза. Барои моделҳои HealthFirst.',
  'Glucose test strips. Compatible with HealthFirst models.',
  'نوار تست قند خون. سازگار با مدل‌های HealthFirst.'),

-- LAB (3)
('LAB-001', 'lab', 'SteriLab', 0.08, 'pcs', 100, true, NULL, false,
  'Пробирка вакуумная с ЭДТА 4 мл',
  'Пробиркаи вакуумӣ бо ЭДТА 4мл',
  'EDTA vacuum tube 4ml',
  'لوله وکیوم EDTA ۴ سی‌سی',
  'Вакуумная пробирка для забора крови с ЭДТА (фиолетовая крышка).',
  'Пробиркаи вакуумӣ барои гирифтани хун бо ЭДТА (сарпӯши бунафш).',
  'Vacuum blood collection tube with EDTA (purple cap).',
  'لوله وکیوم خون‌گیری با EDTA (درب بنفش).'),

('LAB-002', 'lab', 'SteriLab', 0.15, 'pcs', 100, true, NULL, false,
  'Пробирка биохимическая с гелем 5 мл',
  'Пробиркаи биохимиявӣ бо гель 5мл',
  'Biochemistry tube with gel 5ml',
  'لوله بیوشیمی با ژل ۵ سی‌سی',
  'Биохимическая пробирка с разделительным гелем. Жёлтая крышка.',
  'Пробиркаи биохимиявӣ бо гели ҷудокунанда. Сарпӯши зард.',
  'Biochemistry tube with separation gel. Yellow cap.',
  'لوله بیوشیمی با ژل جداکننده. درب زرد.'),

('LAB-003', 'lab', 'SteriLab', 3.20, '× 100', 1, true, NULL, false,
  'Наконечники для дозатора 200 мкл',
  'Нӯкҳои дозатор 200 мкл',
  'Pipette tips 200μL',
  'سرسمپلر ۲۰۰ میکرولیتر',
  'Универсальные наконечники для пипеток-дозаторов. 100 шт.',
  'Нӯкҳои универсалӣ барои пипеткаҳо. 100 дона.',
  'Universal pipette tips. Pack of 100.',
  'سرسمپلر یونیورسال. بسته ۱۰۰ تایی.')

ON CONFLICT (sku) DO NOTHING;

-- ── Done ────────────────────────────────────────────────────────────────
-- Total: 24 products across 6 categories
-- Featured: 8 products
-- Brands: MediCare, SafeWear, BioShield, PureCare, MedTech, ClinicPro, SteriLab, MediPlus, VitaMed, HealthFirst
