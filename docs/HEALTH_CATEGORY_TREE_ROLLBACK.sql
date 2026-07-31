-- Safe rollback for Health category-tree migrations 20-22.
-- Products are never deleted. Operator-created categories and any seeded
-- category that is in use are retained.

begin;

-- Restore the original six public categories as top-level rows.
update public.categories
set parent_id = null, level = 1
where slug in ('gloves', 'masks', 'instruments', 'wound', 'diagnostics', 'lab');

-- Delete seeded non-legacy leaves only when they are unused and childless.
with seeded(slug) as (
  values
    ('protective-apparel'), ('disinfection-antisepsis'), ('sterilization-waste'),
    ('syringes-needles'), ('vascular-access'), ('infusion-transfusion'),
    ('injection-infusion-accessories'), ('gauze-swabs'), ('bandages-tapes'),
    ('advanced-dressings'), ('burn-wound-cleansing'), ('vital-signs-monitoring'),
    ('glucose-monitoring'), ('cardiology-monitoring'), ('examination-instruments'),
    ('imaging-consumables'), ('blood-collection'), ('specimen-collection'),
    ('rapid-testing'), ('laboratory-equipment-consumables'),
    ('blades-sutures-closure'), ('procedure-packs-drapes'), ('suction-drainage'),
    ('operating-room-accessories'), ('oxygen-therapy'), ('nebulization'),
    ('airway-intubation'), ('breathing-circuits-filters'),
    ('resuscitation-suction'), ('anesthesia-supplies'), ('first-aid'),
    ('resuscitation'), ('immobilization'), ('transport-ambulance'),
    ('nursing-consumables'), ('patient-hygiene'), ('bed-protection-linen'),
    ('pressure-care'), ('enteral-feeding'), ('urinary-catheters'),
    ('urine-drainage'), ('ostomy-care'), ('continence-care'),
    ('supports-braces'), ('casting-splinting'), ('compression-therapy'),
    ('mobility-aids'), ('rehabilitation-patient-handling'),
    ('hospital-clinic-furniture'), ('patient-monitoring-equipment'),
    ('infusion-suction-equipment'), ('sterilization-equipment'),
    ('cold-chain'), ('clinic-diagnostic-equipment'),
    ('gynecology-obstetrics'), ('maternity-neonatal-care'),
    ('pediatric-care'), ('breastfeeding-infant-feeding'),
    ('clinical-apparel'), ('patient-apparel'), ('disposable-apparel'),
    ('medical-textiles')
), removable as (
  select c.id
  from public.categories c
  join seeded s on s.slug = c.slug
  where not exists (select 1 from public.categories child where child.parent_id = c.id)
    and not exists (
      select 1 from public.products p
      where p.category_id = c.id or p.category = c.slug
    )
)
delete from public.categories c
using removable r
where c.id = r.id;

-- Delete seeded top-level departments once they are empty and unused.
with seeded(slug) as (
  values
    ('infection-prevention'), ('injection-infusion'), ('wound-dressings'),
    ('diagnostics-monitoring'), ('laboratory-testing'), ('surgery-procedures'),
    ('respiratory-anesthesia'), ('emergency-resuscitation'),
    ('nursing-patient-care'), ('urology-ostomy-continence'),
    ('orthopedics-rehabilitation'), ('medical-equipment-furniture'),
    ('maternal-pediatric-care'), ('medical-apparel-textiles')
)
delete from public.categories c
using seeded s
where c.slug = s.slug
  and not exists (select 1 from public.categories child where child.parent_id = c.id)
  and not exists (
    select 1 from public.products p
    where p.category_id = c.id or p.category = c.slug
  );

commit;

-- parent_id and level intentionally remain. Dropping them is unnecessary for
-- application rollback and could destroy hierarchy created later in the panel.
