-- Migration 21: Health clinical categories (infection through surgery)
begin;

with child_data(slug, parent_slug, name_fa, name_en, name_ru, name_tg, icon, sort_order, initial_active) as (
  values
    ('gloves', 'infection-prevention', 'دستکش‌های پزشکی', 'Medical Gloves', 'Медицинские перчатки', 'Дастпӯшакҳои тиббӣ', 'gloves', 10, true),
    ('masks', 'infection-prevention', 'ماسک و حفاظت تنفسی', 'Masks & Respiratory Protection', 'Маски и защита органов дыхания', 'Ниқоб ва ҳифзи роҳи нафас', 'mask', 20, true),
    ('protective-apparel', 'infection-prevention', 'پوشاک و تجهیزات حفاظتی', 'Protective Apparel & Equipment', 'Защитная одежда и средства защиты', 'Либос ва воситаҳои муҳофизатӣ', 'shieldPlus', 30, false),
    ('disinfection-antisepsis', 'infection-prevention', 'ضدعفونی و آنتی‌سپسیس', 'Disinfection & Antisepsis', 'Дезинфекция и антисептика', 'Безараргардонӣ ва антисептика', 'flask', 40, false),
    ('sterilization-waste', 'infection-prevention', 'استریلیزاسیون و مدیریت پسماند', 'Sterilization & Medical Waste', 'Стерилизация и медицинские отходы', 'Стерилизатсия ва партовҳои тиббӣ', 'package', 50, false),
    ('syringes-needles', 'injection-infusion', 'سرنگ و سرسوزن', 'Syringes & Needles', 'Шприцы и иглы', 'Сӯзандору ва сӯзанҳо', 'syringe', 10, false),
    ('vascular-access', 'injection-infusion', 'دسترسی عروقی و کاتترها', 'Vascular Access & Catheters', 'Сосудистый доступ и катетеры', 'Дастрасии рагӣ ва катетерҳо', 'stethoscope', 20, false),
    ('infusion-transfusion', 'injection-infusion', 'ست‌های انفوزیون و انتقال خون', 'Infusion & Transfusion Sets', 'Инфузионные и трансфузионные системы', 'Системаҳои инфузия ва хунгузаронӣ', 'flask', 30, false),
    ('injection-infusion-accessories', 'injection-infusion', 'ملزومات تزریق و انفوزیون', 'Injection & Infusion Accessories', 'Принадлежности для инъекций и инфузии', 'Лавозимоти тазриқ ва инфузия', 'package', 40, false),
    ('wound', 'wound-dressings', 'پانسمان‌های عمومی و چسب پزشکی', 'General Dressings & Medical Adhesives', 'Перевязочные материалы и медицинские пластыри', 'Маводи бастабандӣ ва часпакҳои тиббӣ', 'bandage', 10, true),
    ('gauze-swabs', 'wound-dressings', 'گاز، پنبه و سواب', 'Gauze, Cotton & Swabs', 'Марля, вата и тампоны', 'Дока, пахта ва тампонҳо', 'package', 20, false),
    ('bandages-tapes', 'wound-dressings', 'باند و نوارهای پزشکی', 'Bandages & Medical Tapes', 'Бинты и медицинские ленты', 'Бинт ва наворҳои тиббӣ', 'bandage', 30, false),
    ('advanced-dressings', 'wound-dressings', 'پانسمان‌های پیشرفته', 'Advanced Wound Dressings', 'Современные раневые покрытия', 'Бастабандиҳои пешрафтаи захм', 'layers', 40, false),
    ('burn-wound-cleansing', 'wound-dressings', 'مراقبت سوختگی و شست‌وشوی زخم', 'Burn Care & Wound Cleansing', 'Уход за ожогами и очищение ран', 'Нигоҳубини сӯхтагӣ ва шустани захм', 'flask', 50, false),
    ('diagnostics', 'diagnostics-monitoring', 'تجهیزات تشخیص و پایش', 'Diagnostic & Monitoring Devices', 'Диагностические и мониторинговые приборы', 'Дастгоҳҳои ташхис ва назорат', 'thermometer', 10, true),
    ('vital-signs-monitoring', 'diagnostics-monitoring', 'پایش علائم حیاتی', 'Vital Signs Monitoring', 'Мониторинг жизненных показателей', 'Назорати нишондодҳои ҳаётӣ', 'stethoscope', 20, false),
    ('glucose-monitoring', 'diagnostics-monitoring', 'پایش قند خون', 'Blood Glucose Monitoring', 'Контроль глюкозы крови', 'Назорати қанди хун', 'flask', 30, false),
    ('cardiology-monitoring', 'diagnostics-monitoring', 'قلب، ECG و الکترودها', 'Cardiology, ECG & Electrodes', 'Кардиология, ЭКГ и электроды', 'Кардиология, ЭКГ ва электродҳо', 'stethoscope', 40, false),
    ('examination-instruments', 'diagnostics-monitoring', 'ابزار معاینه و سنجش', 'Examination & Assessment Instruments', 'Инструменты для осмотра и измерения', 'Асбобҳои муоина ва ченкунӣ', 'stethoscope', 50, false),
    ('imaging-consumables', 'diagnostics-monitoring', 'ملزومات تصویربرداری پزشکی', 'Medical Imaging Consumables', 'Расходные материалы для визуализации', 'Маводи масрафии тасвирбардории тиббӣ', 'thermometer', 60, false),
    ('lab', 'laboratory-testing', 'ملزومات عمومی آزمایشگاه', 'General Laboratory Supplies', 'Общие лабораторные материалы', 'Лавозимоти умумии озмоишгоҳ', 'flask', 10, true),
    ('blood-collection', 'laboratory-testing', 'خون‌گیری و وکیوتینر', 'Blood Collection & Vacutainers', 'Взятие крови и вакуумные пробирки', 'Хунгирӣ ва найчаҳои вакуумӣ', 'flask', 20, false),
    ('specimen-collection', 'laboratory-testing', 'جمع‌آوری و نگهداری نمونه', 'Specimen Collection & Transport', 'Сбор и транспортировка образцов', 'Ҷамъоварӣ ва интиқоли намуна', 'package', 30, false),
    ('rapid-testing', 'laboratory-testing', 'تست‌های سریع و Point-of-Care', 'Rapid & Point-of-Care Testing', 'Экспресс-тесты и Point-of-Care', 'Тестҳои фаврӣ ва Point-of-Care', 'flask', 40, false),
    ('laboratory-equipment-consumables', 'laboratory-testing', 'تجهیزات و مواد مصرفی آزمایشگاه', 'Laboratory Equipment & Consumables', 'Лабораторное оборудование и расходники', 'Таҷҳизот ва маводи масрафии озмоишгоҳ', 'flask', 50, false),
    ('instruments', 'surgery-procedures', 'ابزار جراحی و معاینه', 'Surgical & Examination Instruments', 'Хирургические и смотровые инструменты', 'Асбобҳои ҷарроҳӣ ва муоина', 'stethoscope', 10, true),
    ('blades-sutures-closure', 'surgery-procedures', 'تیغ، بخیه و بستن زخم', 'Blades, Sutures & Wound Closure', 'Лезвия, шовные материалы и закрытие ран', 'Теғ, риштаҳои ҷарроҳӣ ва бастани захм', 'stethoscope', 20, false),
    ('procedure-packs-drapes', 'surgery-procedures', 'پک، ست و پوشش‌های پروسیجر', 'Procedure Packs, Sets & Drapes', 'Процедурные наборы и покрытия', 'Маҷмӯаҳо ва рӯйпӯшҳои амалиётӣ', 'package', 30, false),
    ('suction-drainage', 'surgery-procedures', 'ساکشن و درناژ جراحی', 'Surgical Suction & Drainage', 'Хирургическая аспирация и дренаж', 'Саксия ва дренажи ҷарроҳӣ', 'flask', 40, false),
    ('operating-room-accessories', 'surgery-procedures', 'ملزومات اتاق عمل و پروسیجر', 'Operating Room & Procedure Accessories', 'Принадлежности для операционной и процедур', 'Лавозимоти утоқи ҷарроҳӣ ва амалиёт', 'layers', 50, false)
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
