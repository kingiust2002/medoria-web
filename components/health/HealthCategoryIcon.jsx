// Category-specific Health icons, normalized to the same 24px outline system.
// The vocabulary intentionally mixes three familiar open-source design families
// (Lucide-, Tabler- and Phosphor-style geometry) without adding a runtime package.
// Every icon is rendered with currentColor and the caller's stroke width so the
// existing Health hover, dark-mode and card styles remain unchanged.

const ICONS = {
  "lu:shield-cross": <><path d="M12 3 5 6v5c0 4.7 2.8 8.1 7 10 4.2-1.9 7-5.3 7-10V6l-7-3Z"/><path d="M9 11h6M12 8v6"/></>,
  "lu:syringe": <><path d="m18 2 4 4M17 7l3-3M5 19l4-4M3 21l2-2"/><path d="m8 16-3-3 9-9 3 3-9 9Z"/><path d="m11 7 6 6"/></>,
  "lu:bandage": <><rect x="3" y="9" width="18" height="6" rx="2" transform="rotate(-45 12 12)"/><path d="M10 10h.01M14 10h.01M10 14h.01M14 14h.01"/></>,
  "lu:monitor": <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M6 11h3l2-4 3 8 2-4h2"/></>,
  "lu:heart-pulse": <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3.5 12h4l1.5-3 3 6 2-4h6.5"/></>,
  "lu:layers": <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  "lu:trash": <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></>,
  "lu:connector": <><path d="M8 3v5M16 3v5M5 8h14v4a7 7 0 0 1-14 0V8Z"/><path d="M12 19v3"/></>,
  "lu:specimen-box": <><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/><circle cx="12" cy="7" r="1.5"/></>,
  "lu:scissors": <><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 12 8.5M8.5 15.5 20.5 7"/></>,
  "lu:suction": <><path d="M4 5h8v5a4 4 0 0 1-4 4H4V5Z"/><path d="M12 8h4a4 4 0 0 1 4 4v7M5 18h6M8 14v4"/></>,
  "lu:oxygen": <><circle cx="9" cy="12" r="6"/><path d="M15 7h4l-4 10h4"/><path d="M7 12h4"/></>,
  "lu:filter": <><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/><path d="M8 8h8"/></>,
  "lu:first-aid": <><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M9 6V3h6v3M9 13h6M12 10v6"/></>,
  "lu:ambulance": <><path d="M3 6h11v11H3V6ZM14 10h4l3 4v3h-7v-7Z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M7 9h4M9 7v4"/></>,
  "lu:bed": <><path d="M3 18V8M21 18v-6a3 3 0 0 0-3-3H9v9M3 14h18M5 9h4v5H5a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2Z"/></>,
  "lu:catheter": <><path d="M5 4v5a7 7 0 0 0 14 0V4"/><path d="M5 4h4M15 4h4M12 16v5M9 21h6"/></>,
  "lu:absorbent": <><path d="M6 3h12l2 5-2 13H6L4 8l2-5Z"/><path d="M8 8h8M9 12h6M10 16h4"/></>,
  "lu:compression": <><path d="M7 3h10l2 18H5L7 3Z"/><path d="M8 8h8M7 12h10M6 16h12"/></>,
  "lu:hospital-bed": <><path d="M3 18V8M21 18v-7H9v7M3 15h18M6 8h3v3H6a2 2 0 1 1 0-3Z"/><path d="M17 5v4M15 7h4"/></>,
  "lu:autoclave": <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="13" r="5"/><path d="M7 7h.01M11 7h6M10 13h4M12 11v4"/></>,
  "lu:obstetrics": <><path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="M5 21c.5-5 3-8 7-8s6.5 3 7 8"/><path d="M9 17c1.5 1 4.5 1 6 0"/></>,
  "lu:bottle": <><path d="M9 2h6v4l2 3v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l2-3V2Z"/><path d="M9 6h6M9 12h6M9 16h4"/></>,
  "lu:disposable-gown": <><path d="m8 3-5 5 3 4 2-2v11h8V10l2 2 3-4-5-5-2 3h-4L8 3Z"/><path d="M10 10h4"/></>,

  "tb:mask": <><path d="M4 8c3-2 13-2 16 0v8c-4 3-12 3-16 0V8Z"/><path d="M4 10H2M20 10h2M8 11h8M8 14h8"/></>,
  "tb:spray": <><path d="M8 7h8l2 4v10H6V11l2-4Z"/><path d="M10 7V4h6l2 2M9 14h6M20 5h2M20 8h2"/></>,
  "tb:tape": <><circle cx="10" cy="12" r="7"/><circle cx="10" cy="12" r="3"/><path d="M17 12h4v6h-7"/></>,
  "tb:droplets": <><path d="M8 3S3 9 3 13a5 5 0 0 0 10 0C13 9 8 3 8 3Z"/><path d="M17 8s-3 4-3 6.5a3.5 3.5 0 0 0 7 0C21 12 17 8 17 8Z"/></>,
  "tb:activity": <><path d="M3 12h4l2-6 4 12 2-6h6"/></>,
  "tb:stethoscope": <><path d="M5 3v6a5 5 0 0 0 10 0V3M3 3h4M13 3h4M10 14v3a4 4 0 0 0 8 0"/><circle cx="19" cy="14" r="2"/></>,
  "tb:microscope": <><path d="m9 3 5 2-3 8-5-2 3-8Z"/><path d="M6 11a6 6 0 0 0 6 8h5M12 16h5M15 6l2 1M5 21h14"/></>,
  "tb:test-strip": <><rect x="8" y="2" width="8" height="20" rx="2"/><path d="M10 6h4M10 10h4M10 15h4M12 18h.01"/></>,
  "tb:scalpel": <><path d="m4 20 8-8M10 14l-2-2 8-8 4 4-8 8-2-2Z"/><path d="M5 19h4"/></>,
  "tb:operating-room": <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M9 21v-7h6v7M9 9h6M12 6v6"/></>,
  "tb:nebulizer": <><rect x="3" y="12" width="10" height="8" rx="2"/><path d="M13 15h3a3 3 0 0 0 3-3V7M17 7h4M5 9c1-2 2-3 4-4M9 9c1.5-2.5 3-3.5 5-4"/></>,
  "tb:ambu-bag": <><path d="M6 7h8v10H6a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3Z"/><path d="M14 10h4l3 2-3 2h-4M8 7V4M8 20v-3"/></>,
  "tb:cpr": <><path d="M12 21 4.5 13.5A5 5 0 0 1 11 6l1 1 1-1a5 5 0 0 1 6.5 7.5L12 21Z"/><path d="M7 13h3l1-3 2 6 1-3h3"/></>,
  "tb:nursing": <><path d="M8 4h8l2 4v13H6V8l2-4Z"/><path d="M9 4V2h6v2M9 11h6M12 8v6M9 18h6"/></>,
  "tb:pressure": <><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 16c2-5 6-5 8 0M9 8h6M12 6v4"/></>,
  "tb:urine-bag": <><path d="M7 4h10v4l2 4v9H5v-9l2-4V4Z"/><path d="M9 4V2h6v2M8 15h8M12 11v8"/></>,
  "tb:brace": <><path d="M8 3h8l2 5-2 13H8L6 8l2-5Z"/><path d="M7 8h10M7 13h10M8 18h8"/></>,
  "tb:wheelchair": <><circle cx="10" cy="18" r="4"/><circle cx="10" cy="5" r="2"/><path d="M10 8v5h5l3 5M10 11h4M6 14l-2 4"/></>,
  "tb:patient-monitor": <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M7 11h3l1-3 3 6 1-3h2M9 21h6M12 17v4"/></>,
  "tb:fridge": <><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M6 10h12M9 6h.01M9 14h.01M14 15v4M12 17h4"/></>,
  "tb:baby": <><circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 15c2 1.5 4 1.5 6 0M12 4c0-2 3-2 3 0"/></>,
  "tb:scrubs": <><path d="m8 3-5 5 3 4 2-2v11h8V10l2 2 3-4-5-5-2 3h-4L8 3Z"/><path d="m10 6 2 3 2-3M12 9v12"/></>,
  "tb:blanket": <><path d="M5 3h14v18H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/><path d="M7 3v18M10 7h6M10 11h6M10 15h4"/></>,

  "ph:coat": <><path d="m8 3-3 4 2 4 2-2v12h6V9l2 2 2-4-3-4-2 4h-4L8 3Z"/><path d="M12 7v14M9 13h6"/></>,
  "ph:iv-bag": <><path d="M9 2h6M10 2v3l-3 3v10a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V8l-3-3V2"/><path d="M9 10h6M12 13v5M10 15h4"/></>,
  "ph:gauze": <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 4 8 16M4 8l16 8M4 16l16-8M8 20l8-16"/></>,
  "ph:blood-drop": <><path d="M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z"/><path d="M9 16a3 3 0 0 0 3 2"/></>,
  "ph:scan": <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="4"/><path d="M12 9v6M9 12h6"/></>,
  "ph:test-tube": <><path d="M9 2h6M10 2v7l-5 8a3 3 0 0 0 2.5 5h9a3 3 0 0 0 2.5-5l-5-8V2"/><path d="M7 17h10M9 13h6"/></>,
  "ph:centrifuge": <><path d="M8 3h8l-1 6H9L8 3Z"/><path d="M10 9v4l-5 4v4h14v-4l-5-4V9M8 17h8"/><circle cx="12" cy="6" r="1"/></>,
  "ph:procedure-pack": <><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/><path d="M9 6h6"/></>,
  "ph:airway": <><path d="M8 3v6a4 4 0 0 0 8 0V3M12 13v8"/><path d="M7 21h10M5 3h6M13 3h6"/></>,
  "ph:anesthesia": <><path d="M7 4h10l2 5-2 10H7L5 9l2-5Z"/><path d="M9 9h6M10 13h4M12 16h.01"/></>,
  "ph:splint": <><path d="M7 3h10v18H7V3Z"/><path d="M7 8h10M7 16h10M10 3v18M14 3v18"/></>,
  "ph:hygiene": <><path d="M7 10h10l2 4v6H5v-6l2-4Z"/><path d="M9 10V6h6v4M10 6V3h4v3M8 15h8"/></>,
  "ph:feeding": <><path d="M8 3h8v5l2 3v10H6V11l2-3V3Z"/><path d="M8 8h8M9 14h6M12 11v6"/></>,
  "ph:ostomy": <><circle cx="12" cy="9" r="5"/><path d="M7 13v8h10v-8M9 9h6M12 6v6"/></>,
  "ph:cast": <><path d="M9 3h6l2 5-1 13H8L7 8l2-5Z"/><path d="M8 8h8M8 13h8M8 18h8"/></>,
  "ph:rehab": <><circle cx="12" cy="5" r="2"/><path d="m8 9 4 2 4-2M12 11v5M8 21l4-5 4 5M5 14h4M15 14h4"/></>,
  "ph:pump": <><rect x="5" y="3" width="14" height="18" rx="2"/><rect x="8" y="6" width="8" height="5" rx="1"/><path d="M9 15h6M12 13v4M19 8h2v8h-2"/></>,
  "ph:exam-table": <><path d="M4 15h16v5H4v-5ZM6 15V8h8a4 4 0 0 1 4 4v3M7 20v2M17 20v2"/><circle cx="8" cy="6" r="2"/></>,
  "ph:child": <><circle cx="12" cy="7" r="3"/><path d="M7 21c.5-6 2-9 5-9s4.5 3 5 9M5 15h14M9 21l-1-5M15 21l1-5"/></>,
  "ph:patient-gown": <><path d="m8 3-4 5 3 4 2-2v11h6V10l2 2 3-4-4-5-2 4h-4L8 3Z"/><path d="M10 8h4M12 8v13"/></>,
  "ph:medical-box": <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M9 5V3h6v2M9 13h6M12 10v6"/></>,
};

const PRIMARY_BY_SLUG = {
  "infection-prevention": "lu:shield-cross",
  "injection-infusion": "ph:iv-bag",
  "wound-dressings": "lu:bandage",
  "diagnostics-monitoring": "lu:monitor",
  "laboratory-testing": "tb:microscope",
  "surgery-procedures": "tb:scalpel",
  "respiratory-anesthesia": "lu:oxygen",
  "emergency-resuscitation": "lu:ambulance",
  "nursing-patient-care": "tb:nursing",
  "urology-ostomy-continence": "ph:ostomy",
  "orthopedics-rehabilitation": "tb:brace",
  "medical-equipment-furniture": "lu:hospital-bed",
  "maternal-pediatric-care": "tb:baby",
  "medical-apparel-textiles": "tb:scrubs",

  gloves: "lu:shield-cross",
  masks: "tb:mask",
  "protective-apparel": "ph:coat",
  "disinfection-antisepsis": "tb:spray",
  "sterilization-waste": "lu:trash",
  "syringes-needles": "lu:syringe",
  "vascular-access": "lu:catheter",
  "infusion-transfusion": "ph:iv-bag",
  "injection-infusion-accessories": "lu:connector",
  wound: "lu:bandage",
  "gauze-swabs": "ph:gauze",
  "bandages-tapes": "tb:tape",
  "advanced-dressings": "lu:layers",
  "burn-wound-cleansing": "tb:droplets",
  diagnostics: "lu:monitor",
  "vital-signs-monitoring": "tb:activity",
  "glucose-monitoring": "ph:blood-drop",
  "cardiology-monitoring": "lu:heart-pulse",
  "examination-instruments": "tb:stethoscope",
  "imaging-consumables": "ph:scan",
  lab: "tb:microscope",
  "blood-collection": "ph:test-tube",
  "specimen-collection": "lu:specimen-box",
  "rapid-testing": "tb:test-strip",
  "laboratory-equipment-consumables": "ph:centrifuge",
  instruments: "lu:scissors",
  "blades-sutures-closure": "tb:scalpel",
  "procedure-packs-drapes": "ph:procedure-pack",
  "suction-drainage": "lu:suction",
  "operating-room-accessories": "tb:operating-room",
  "oxygen-therapy": "lu:oxygen",
  nebulization: "tb:nebulizer",
  "airway-intubation": "ph:airway",
  "breathing-circuits-filters": "lu:filter",
  "resuscitation-suction": "tb:ambu-bag",
  "anesthesia-supplies": "ph:anesthesia",
  "first-aid": "lu:first-aid",
  resuscitation: "tb:cpr",
  immobilization: "ph:splint",
  "transport-ambulance": "lu:ambulance",
  "nursing-consumables": "tb:nursing",
  "patient-hygiene": "ph:hygiene",
  "bed-protection-linen": "lu:bed",
  "pressure-care": "tb:pressure",
  "enteral-feeding": "ph:feeding",
  "urinary-catheters": "lu:catheter",
  "urine-drainage": "tb:urine-bag",
  "ostomy-care": "ph:ostomy",
  "continence-care": "lu:absorbent",
  "supports-braces": "tb:brace",
  "casting-splinting": "ph:cast",
  "compression-therapy": "lu:compression",
  "mobility-aids": "tb:wheelchair",
  "rehabilitation-patient-handling": "ph:rehab",
  "hospital-clinic-furniture": "lu:hospital-bed",
  "patient-monitoring-equipment": "tb:patient-monitor",
  "infusion-suction-equipment": "ph:pump",
  "sterilization-equipment": "lu:autoclave",
  "cold-chain": "tb:fridge",
  "clinic-diagnostic-equipment": "ph:exam-table",
  "gynecology-obstetrics": "lu:obstetrics",
  "maternity-neonatal-care": "tb:baby",
  "pediatric-care": "ph:child",
  "breastfeeding-infant-feeding": "lu:bottle",
  "clinical-apparel": "tb:scrubs",
  "patient-apparel": "ph:patient-gown",
  "disposable-apparel": "lu:disposable-gown",
  "medical-textiles": "tb:blanket",
};

const KEYWORD_RULES = [
  [["blood", "vacutainer", "phlebotomy"], "ph:blood-drop"],
  [["tube", "vial", "specimen", "sample"], "ph:test-tube"],
  [["rapid", "test-strip", "assay"], "tb:test-strip"],
  [["microscope", "laboratory", "lab-"], "tb:microscope"],
  [["centrifuge", "analyzer"], "ph:centrifuge"],
  [["syringe", "needle", "lancet"], "lu:syringe"],
  [["catheter", "cannula", "vascular"], "lu:catheter"],
  [["infusion", "transfusion", "iv-"], "ph:iv-bag"],
  [["glove"], "lu:shield-cross"],
  [["mask", "respirator"], "tb:mask"],
  [["gown", "apparel", "scrub", "coat"], "tb:scrubs"],
  [["disinfect", "antiseptic", "cleaning", "spray"], "tb:spray"],
  [["steril", "autoclave"], "lu:autoclave"],
  [["waste", "sharps"], "lu:trash"],
  [["gauze", "swab", "cotton"], "ph:gauze"],
  [["bandage", "dressing", "adhesive", "tape", "wound"], "lu:bandage"],
  [["burn", "irrigation", "cleansing"], "tb:droplets"],
  [["heart", "cardio", "ecg", "electrode"], "lu:heart-pulse"],
  [["temperature", "vital", "pulse", "pressure", "monitor"], "tb:activity"],
  [["glucose", "diabetes"], "ph:blood-drop"],
  [["imaging", "ultrasound", "x-ray", "scan"], "ph:scan"],
  [["scalpel", "blade", "suture", "closure"], "tb:scalpel"],
  [["instrument", "forceps", "scissor"], "lu:scissors"],
  [["procedure", "drape", "pack", "set"], "ph:procedure-pack"],
  [["suction", "drain"], "lu:suction"],
  [["oxygen"], "lu:oxygen"],
  [["nebul", "aerosol"], "tb:nebulizer"],
  [["airway", "intubat", "trache"], "ph:airway"],
  [["circuit", "filter", "connector"], "lu:filter"],
  [["resusc", "cpr", "ambu"], "tb:cpr"],
  [["anesthesia", "anaesthesia"], "ph:anesthesia"],
  [["first-aid", "trauma"], "lu:first-aid"],
  [["ambulance", "transport", "stretcher"], "lu:ambulance"],
  [["splint", "immobil", "cast"], "ph:splint"],
  [["nursing"], "tb:nursing"],
  [["hygiene", "wash", "bath"], "ph:hygiene"],
  [["bed", "linen", "mattress", "pillow"], "lu:bed"],
  [["feeding", "enteral", "nutrition"], "ph:feeding"],
  [["urine", "urinary"], "tb:urine-bag"],
  [["ostomy", "stoma", "colostomy"], "ph:ostomy"],
  [["continence", "incontinence", "absorbent", "diaper"], "lu:absorbent"],
  [["brace", "support"], "tb:brace"],
  [["compression", "venous"], "lu:compression"],
  [["wheelchair", "walker", "mobility", "crutch"], "tb:wheelchair"],
  [["rehab", "handling", "transfer"], "ph:rehab"],
  [["furniture", "table", "chair", "trolley"], "ph:exam-table"],
  [["pump"], "ph:pump"],
  [["cold", "refriger", "storage"], "tb:fridge"],
  [["gyne", "obstetric", "maternity"], "lu:obstetrics"],
  [["baby", "neonatal", "pediatric", "infant"], "tb:baby"],
  [["breast", "bottle"], "lu:bottle"],
  [["textile", "blanket"], "tb:blanket"],
];

const LEGACY_ICON_MAP = {
  gloves: "lu:shield-cross",
  mask: "tb:mask",
  shieldPlus: "lu:shield-cross",
  syringe: "lu:syringe",
  bandage: "lu:bandage",
  thermometer: "lu:monitor",
  flask: "ph:test-tube",
  stethoscope: "tb:stethoscope",
  hospital: "lu:hospital-bed",
  building: "ph:exam-table",
  layers: "lu:layers",
  package: "ph:procedure-pack",
  pill: "ph:medical-box",
};

const FALLBACK_PALETTE = Object.keys(ICONS);

function stableHash(value) {
  let hash = 0;
  for (const char of String(value || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

export function healthCategoryIconName(node) {
  const slug = String(node?.slug || "").toLowerCase();
  if (PRIMARY_BY_SLUG[slug]) return PRIMARY_BY_SLUG[slug];

  for (const [tokens, icon] of KEYWORD_RULES) {
    if (tokens.some((token) => slug.includes(token))) return icon;
  }

  return LEGACY_ICON_MAP[node?.icon] || FALLBACK_PALETTE[stableHash(slug) % FALLBACK_PALETTE.length] || "ph:medical-box";
}

// Resolve icons as a sibling set. A semantic choice is kept when possible; if
// two sibling categories resolve to the same symbol, a deterministic unused
// symbol is selected. This guarantees visual variety on every category page.
export function resolveHealthCategoryIcons(items = []) {
  const used = new Set();
  return items.map((node, index) => {
    let icon = healthCategoryIconName(node);
    if (used.has(icon)) {
      const start = (stableHash(node?.slug) + index) % FALLBACK_PALETTE.length;
      for (let offset = 0; offset < FALLBACK_PALETTE.length; offset += 1) {
        const candidate = FALLBACK_PALETTE[(start + offset) % FALLBACK_PALETTE.length];
        if (!used.has(candidate)) {
          icon = candidate;
          break;
        }
      }
    }
    used.add(icon);
    return icon;
  });
}

export default function HealthCategoryIcon({ node, name, size = 24, strokeWidth = 1.6, className = "" }) {
  const iconName = name || healthCategoryIconName(node);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-icon-pack={String(iconName).split(":")[0]}
    >
      {ICONS[iconName] || ICONS["ph:medical-box"]}
    </svg>
  );
}
