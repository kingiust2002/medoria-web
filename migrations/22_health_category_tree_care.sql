-- Migration 22: Health care and equipment categories (respiratory through textiles)
begin;

with child_data(slug, parent_slug, name_fa, name_en, name_ru, name_tg, icon, sort_order, initial_active) as (
  values
    ('oxygen-therapy', 'respiratory-anesthesia', 'اکسیژن‌تراپی', 'Oxygen Therapy', 'Кислородная терапия', 'Оксигенотерапия', 'mask', 10, false),
    ('nebulization', 'respiratory-anesthesia', 'نبولایزر و آئروسل‌تراپی', 'Nebulization & Aerosol Therapy', 'Небулайзерная и аэрозольная терапия', 'Небулайзер ва аэрозолтерапия', 'flask', 20, false),
    ('airway-intubation', 'respiratory-anesthesia', 'مدیریت راه هوایی و لوله‌گذاری', 'Airway Management & Intubation', 'Управление дыхательными путями и интубация', 'Идоракунии роҳи нафас ва интубатсия', 'mask', 30, false),
    ('breathing-circuits-filters', 'respiratory-anesthesia', 'مدارها، فیلترها و اتصالات تنفسی', 'Breathing Circuits, Filters & Connectors', 'Дыхательные контуры, фильтры и соединители', 'Контурҳо, филтрҳо ва пайвастҳои нафаскашӣ', 'mask', 40, false),
    ('resuscitation-suction', 'respiratory-anesthesia', 'احیای دستی و ساکشن تنفسی', 'Manual Resuscitation & Respiratory Suction', 'Ручная реанимация и респираторная аспирация', 'Эҳёи дастӣ ва саксияи нафаскашӣ', 'stethoscope', 50, false),
    ('anesthesia-supplies', 'respiratory-anesthesia', 'ملزومات بیهوشی', 'Anesthesia Supplies', 'Расходные материалы для анестезии', 'Лавозимоти беҳискунӣ', 'stethoscope', 60, false),
    ('first-aid', 'emergency-resuscitation', 'کمک‌های اولیه و تروما', 'First Aid & Trauma Care', 'Первая помощь и травматология', 'Ёрии аввал ва осебшиносӣ', 'package', 10, false),
    ('resuscitation', 'emergency-resuscitation', 'احیا و CPR', 'Resuscitation & CPR', 'Реанимация и СЛР', 'Эҳё ва CPR', 'stethoscope', 20, false),
    ('immobilization', 'emergency-resuscitation', 'بی‌حرکت‌سازی و تثبیت', 'Immobilization & Stabilization', 'Иммобилизация и стабилизация', 'Беҳаракатсозӣ ва устуворкунӣ', 'stethoscope', 30, false),
    ('transport-ambulance', 'emergency-resuscitation', 'انتقال بیمار و تجهیزات آمبولانس', 'Patient Transport & Ambulance Supplies', 'Транспортировка пациента и оснащение скорой помощи', 'Интиқоли бемор ва лавозимоти ёрии таъҷилӣ', 'hospital', 40, false),
    ('nursing-consumables', 'nursing-patient-care', 'ملزومات عمومی پرستاری', 'General Nursing Supplies', 'Общие сестринские принадлежности', 'Лавозимоти умумии ҳамширагӣ', 'stethoscope', 10, false),
    ('patient-hygiene', 'nursing-patient-care', 'بهداشت و مراقبت روزانه بیمار', 'Patient Hygiene & Daily Care', 'Гигиена и ежедневный уход за пациентом', 'Гигиена ва нигоҳубини ҳаррӯзаи бемор', 'flask', 20, false),
    ('bed-protection-linen', 'nursing-patient-care', 'محافظ تخت و ملحفه بیمار', 'Bed Protection & Patient Linen', 'Защита кровати и бельё пациента', 'Муҳофизати кат ва рӯйпӯши бемор', 'layers', 30, false),
    ('pressure-care', 'nursing-patient-care', 'پیشگیری از زخم فشاری', 'Pressure Injury Prevention', 'Профилактика пролежней', 'Пешгирии захми фишорӣ', 'shieldPlus', 40, false),
    ('enteral-feeding', 'nursing-patient-care', 'تغذیه روده‌ای و لوله‌ای', 'Enteral & Tube Feeding', 'Энтеральное и зондовое питание', 'Ғизодиҳии энтералӣ ва найчагӣ', 'flask', 50, false),
    ('urinary-catheters', 'urology-ostomy-continence', 'سوندهای ادراری', 'Urinary Catheters', 'Мочевые катетеры', 'Катетерҳои пешобӣ', 'stethoscope', 10, false),
    ('urine-drainage', 'urology-ostomy-continence', 'کیسه ادرار و سیستم‌های درناژ', 'Urine Bags & Drainage Systems', 'Мочеприёмники и дренажные системы', 'Халтаҳои пешоб ва системаҳои дренажӣ', 'flask', 20, false),
    ('ostomy-care', 'urology-ostomy-continence', 'مراقبت استومی', 'Ostomy Care', 'Уход за стомой', 'Нигоҳубини стома', 'package', 30, false),
    ('continence-care', 'urology-ostomy-continence', 'محصولات بی‌اختیاری و جذب', 'Continence & Absorbent Care', 'Уход при недержании и впитывающие изделия', 'Нигоҳубини беихтиёрӣ ва маҳсулоти ҷаббанда', 'shieldPlus', 40, false),
    ('supports-braces', 'orthopedics-rehabilitation', 'ساپورت‌ها و بریس‌های طبی', 'Supports & Braces', 'Ортезы, бандажи и фиксаторы', 'Ортезҳо ва нигоҳдорандаҳо', 'stethoscope', 10, false),
    ('casting-splinting', 'orthopedics-rehabilitation', 'گچ، آتل و ثابت‌کننده‌ها', 'Casting, Splinting & Immobilizers', 'Гипс, шины и иммобилизаторы', 'Гач, шина ва устуворкунандаҳо', 'layers', 20, false),
    ('compression-therapy', 'orthopedics-rehabilitation', 'فشرده‌سازی و وریددرمانی', 'Compression & Venous Therapy', 'Компрессионная и венозная терапия', 'Терапияи фишорӣ ва рагӣ', 'stethoscope', 30, false),
    ('mobility-aids', 'orthopedics-rehabilitation', 'وسایل کمک‌حرکتی', 'Mobility Aids', 'Средства передвижения', 'Воситаҳои ёрирасони ҳаракат', 'building', 40, false),
    ('rehabilitation-patient-handling', 'orthopedics-rehabilitation', 'توان‌بخشی و جابه‌جایی بیمار', 'Rehabilitation & Patient Handling', 'Реабилитация и перемещение пациента', 'Тавонбахшӣ ва ҷобаҷокунии бемор', 'hospital', 50, false),
    ('hospital-clinic-furniture', 'medical-equipment-furniture', 'مبلمان بیمارستان و کلینیک', 'Hospital & Clinic Furniture', 'Больничная и клиническая мебель', 'Мебели беморхона ва клиника', 'hospital', 10, false),
    ('patient-monitoring-equipment', 'medical-equipment-furniture', 'تجهیزات پایش بیمار', 'Patient Monitoring Equipment', 'Оборудование для мониторинга пациента', 'Таҷҳизоти назорати бемор', 'thermometer', 20, false),
    ('infusion-suction-equipment', 'medical-equipment-furniture', 'تجهیزات انفوزیون و ساکشن', 'Infusion & Suction Equipment', 'Инфузионное и аспирационное оборудование', 'Таҷҳизоти инфузия ва саксия', 'stethoscope', 30, false),
    ('sterilization-equipment', 'medical-equipment-furniture', 'تجهیزات استریلیزاسیون', 'Sterilization Equipment', 'Стерилизационное оборудование', 'Таҷҳизоти стерилизатсия', 'shieldPlus', 40, false),
    ('cold-chain', 'medical-equipment-furniture', 'زنجیره سرد و نگهداری پزشکی', 'Medical Cold Chain & Storage', 'Медицинская холодовая цепь и хранение', 'Занҷираи сард ва нигоҳдории тиббӣ', 'package', 50, false),
    ('clinic-diagnostic-equipment', 'medical-equipment-furniture', 'تجهیزات عمومی کلینیک و تشخیص', 'General Clinic & Diagnostic Equipment', 'Общее клиническое и диагностическое оборудование', 'Таҷҳизоти умумии клиникӣ ва ташхисӣ', 'stethoscope', 60, false),
    ('gynecology-obstetrics', 'maternal-pediatric-care', 'زنان و زایمان', 'Gynecology & Obstetrics', 'Гинекология и акушерство', 'Гинекология ва момодоягӣ', 'hospital', 10, false),
    ('maternity-neonatal-care', 'maternal-pediatric-care', 'مراقبت مادر و نوزاد', 'Maternity & Neonatal Care', 'Уход за матерью и новорождённым', 'Нигоҳубини модар ва навзод', 'hospital', 20, false),
    ('pediatric-care', 'maternal-pediatric-care', 'مراقبت و ملزومات اطفال', 'Pediatric Care & Supplies', 'Педиатрический уход и принадлежности', 'Нигоҳубин ва лавозимоти кӯдакон', 'hospital', 30, false),
    ('breastfeeding-infant-feeding', 'maternal-pediatric-care', 'شیردهی و تغذیه کودک', 'Breastfeeding & Infant Feeding', 'Грудное вскармливание и питание младенцев', 'Ширмаконӣ ва ғизодиҳии кӯдак', 'flask', 40, false),
    ('clinical-apparel', 'medical-apparel-textiles', 'اسکراب، روپوش و لباس کادر درمان', 'Scrubs, Coats & Clinical Apparel', 'Медицинские костюмы, халаты и одежда персонала', 'Скраб, халат ва либоси кормандони тиб', 'layers', 10, false),
    ('patient-apparel', 'medical-apparel-textiles', 'لباس بیمار', 'Patient Apparel', 'Одежда для пациентов', 'Либоси бемор', 'layers', 20, false),
    ('disposable-apparel', 'medical-apparel-textiles', 'پوشاک یک‌بارمصرف پزشکی', 'Disposable Medical Apparel', 'Одноразовая медицинская одежда', 'Либоси яккаратаи тиббӣ', 'shieldPlus', 30, false),
    ('medical-textiles', 'medical-apparel-textiles', 'ملحفه، پتو و منسوجات بیمارستانی', 'Hospital Linen, Blankets & Textiles', 'Больничное бельё, одеяла и текстиль', 'Рӯйпӯш, кӯрпа ва нассоҷии беморхона', 'layers', 40, false)
)
insert into public.categories (
  slug, name_fa, name_en, name_ru, name_tg, icon,
  sort_order, is_active, is_featured, parent_id, level
)
select d.slug, d.name_fa, d.name_en, d.name_ru, d.name_tg, d.icon,
       d.sort_order, d.initial_active, false, p.id, 2
from child_data d
join public.categories p on p.slug = d.parent_slug
on conflict (slug) do update set
  name_fa = excluded.name_fa,
  name_en = excluded.name_en,
  name_ru = excluded.name_ru,
  name_tg = excluded.name_tg,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  parent_id = excluded.parent_id,
  level = 2;

commit;
