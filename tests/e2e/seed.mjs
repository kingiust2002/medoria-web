// Seed data for the end-to-end tests. Invented demo rows only: names, prices and
// phone numbers below are placeholders, never real customer or catalogue data.
const ts = "2026-10-01T10:00:00.000Z";

const category = (id, slug, en) => ({
  id, slug, name_en: en, name_ru: en, name_tg: en, name_fa: en, icon: "gloves",
  is_active: true, is_featured: true, sort_order: id, parent_id: null, created_at: ts,
});

const product = (id, slug, extra = {}) => ({
  id, slug, sku: `E2E-${id}`, name_en: `E2E Product ${id}`, name_ru: `E2E Product ${id}`, name_tg: `E2E Product ${id}`, name_fa: `E2E Product ${id}`,
  description_en: "Demo product for end-to-end tests.", description_ru: "", description_tg: "", description_fa: "",
  price: 10, currency: "USD", unit: "box", min_order_qty: 1, brand: "E2E", badge: null,
  category: "gloves", category_id: 1, in_stock: true, is_active: true, is_featured: false,
  specs: {}, tags: [], views: 0, image_url: null, created_at: ts, updated_at: ts, ...extra,
});

const quote = (id, status, extra = {}, prefix = "MH") => ({
  id, status, tracking_code: `${prefix}-0000-0000-000${id}`, assigned_to: null, first_response_at: null, notify_status: "sent", notify_detail: null, name: `E2E Customer ${id}`, organization: "", phone: `+99290000000${id}`, product_name: null, product_sku: null,
  quantity: null, preferred_contact: "whatsapp", language: "en", message: "E2E demo message", internal_notes: "", source_url: null,
  created_at: `2026-10-0${id}T10:00:00.000Z`, updated_at: ts, ...extra,
});

export function seed() {
  return {
    categories: [category(1, "gloves", "Gloves"), category(2, "masks", "Masks")],
    products: [
      product(1, "e2e-gloves", { price: 10 }),
      product(2, "e2e-archived", { is_active: false, price: 20 }),
      product(3, "e2e-masks", { price: 5, category: "masks", category_id: 2 }),
    ],
    quote_requests: [quote(1, "new"), quote(2, "new", { notify_status: "failed", notify_detail: "http_401" }), quote(3, "contacted"), quote(4, "spam"), quote(5, "archived")],
    beauty_categories: [], beauty_products: [], beauty_brands: [],
    beauty_quote_requests: [quote(1, "new", { name: "E2E Beauty Customer" }, "MB")],
    operator_audit_log: [], operator_sessions: [], operator_totp_state: [], operator_recovery_used: [],
  };
}
