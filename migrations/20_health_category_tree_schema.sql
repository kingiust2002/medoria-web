-- Migration 20: Health category tree schema and 14 top-level departments
begin;

alter table public.categories
  add column if not exists parent_id bigint,
  add column if not exists level smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_parent_id_fkey') then
    alter table public.categories add constraint categories_parent_id_fkey
      foreign key (parent_id) references public.categories(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_level_check') then
    alter table public.categories add constraint categories_level_check check (level between 1 and 3);
  end if;
end $$;

create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists categories_parent_sort_idx on public.categories(parent_id, sort_order, id);

with root_data(slug, name_fa, name_en, name_ru, name_tg, icon, sort_order, initial_active) as (
  values
    ('infection-prevention', 'پیشگیری از عفونت و حفاظت فردی', 'Infection Prevention & Personal Protection', 'Профилактика инфекций и средства защиты', 'Пешгирии сироят ва воситаҳои муҳофизат', 'shieldPlus', 10, true),
    ('injection-infusion', 'تزریق، انفوزیون و دسترسی عروقی', 'Injection, Infusion & Vascular Access', 'Инъекции, инфузия и сосудистый доступ', 'Тазриқ, инфузия ва дастрасии рагӣ', 'syringe', 20, false),
    ('wound-dressings', 'مراقبت زخم و پانسمان', 'Wound Care & Dressings', 'Уход за ранами и перевязочные материалы', 'Нигоҳубини захм ва маводи бастабандӣ', 'bandage', 30, true),
    ('diagnostics-monitoring', 'تشخیص و پایش بیمار', 'Diagnostics & Patient Monitoring', 'Диагностика и мониторинг пациента', 'Ташхис ва назорати бемор', 'thermometer', 40, true),
    ('laboratory-testing', 'آزمایشگاه و تست‌های تشخیصی', 'Laboratory & Diagnostic Testing', 'Лаборатория и диагностические тесты', 'Озмоишгоҳ ва тестҳои ташхисӣ', 'flask', 50, true),
    ('surgery-procedures', 'جراحی و ملزومات پروسیجر', 'Surgery & Procedure Supplies', 'Хирургия и процедурные материалы', 'Ҷарроҳӣ ва лавозимоти амалиётӣ', 'stethoscope', 60, true),
    ('respiratory-anesthesia', 'مراقبت تنفسی و بیهوشی', 'Respiratory Care & Anesthesia', 'Респираторная терапия и анестезия', 'Нигоҳубини нафаскашӣ ва беҳискунӣ', 'mask', 70, false),
    ('emergency-resuscitation', 'اورژانس، احیا و انتقال بیمار', 'Emergency, Resuscitation & Patient Transport', 'Неотложная помощь, реанимация и транспортировка', 'Ёрии таъҷилӣ, эҳё ва интиқоли бемор', 'hospital', 80, false),
    ('nursing-patient-care', 'پرستاری و مراقبت بیمار', 'Nursing & Patient Care', 'Сестринский уход и уход за пациентом', 'Нигоҳубини ҳамширагӣ ва бемор', 'stethoscope', 90, false),
    ('urology-ostomy-continence', 'اورولوژی، استومی و مراقبت بی‌اختیاری', 'Urology, Ostomy & Continence Care', 'Урология, стома и уход при недержании', 'Урология, стома ва нигоҳубини беихтиёрӣ', 'flask', 100, false),
    ('orthopedics-rehabilitation', 'ارتوپدی، توان‌بخشی و حرکت', 'Orthopedics, Rehabilitation & Mobility', 'Ортопедия, реабилитация и мобильность', 'Ортопедия, тавонбахшӣ ва ҳаракат', 'stethoscope', 110, false),
    ('medical-equipment-furniture', 'تجهیزات پزشکی و مبلمان درمانی', 'Medical Equipment & Clinical Furniture', 'Медицинское оборудование и мебель', 'Таҷҳизоти тиббӣ ва мебели табобатӣ', 'thermometer', 120, false),
    ('maternal-pediatric-care', 'مراقبت مادر، نوزاد و کودک', 'Maternal, Neonatal & Pediatric Care', 'Акушерство, новорождённые и педиатрия', 'Нигоҳубини модар, навзод ва кӯдак', 'hospital', 130, false),
    ('medical-apparel-textiles', 'پوشاک و منسوجات پزشکی', 'Medical Apparel & Textiles', 'Медицинская одежда и текстиль', 'Либос ва нассоҷии тиббӣ', 'layers', 140, false)
)
insert into public.categories (
  slug, name_fa, name_en, name_ru, name_tg, icon,
  sort_order, is_active, is_featured, parent_id, level
)
select slug, name_fa, name_en, name_ru, name_tg, icon,
       sort_order, initial_active, false, null, 1
from root_data
on conflict (slug) do update set
  name_fa = excluded.name_fa,
  name_en = excluded.name_en,
  name_ru = excluded.name_ru,
  name_tg = excluded.name_tg,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  parent_id = null,
  level = 1;

commit;
