// Independent review probes. Intentionally outside npm test's *.test.mjs glob.
// Run: node --test --test-reporter=tap tests/review-panel-platform-20261029.mjs
// These assertions describe the REQUIRED safe behavior and are expected to fail
// on c8cb9c60b46efa6e75892d2f3b24f5cca0877575. No live services are contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createMemoryAdmin } from './helpers/memoryAdmin.mjs';
import { deleteDocument } from '../lib/operator/documentsCore.js';
import { DOC_BUCKETS } from '../lib/operator/documents.js';
import { executeApprovedQuoteDelete } from '../lib/operator/destructiveApproval.js';
import { planCategoryDelete, executeApprovedCategoryDelete } from '../lib/operator/categoryDelete.js';
import { deleteMedia } from '../lib/operator/mediaLibrary.js';
import { decide } from '../lib/operator/authz.js';
import { readQuotesPage } from '../lib/operator/listReaders.js';
import { parseQuoteParams } from '../lib/operator/listQuery.js';
import { applyBulkChange } from '../lib/operator/bulkCore.js';
const root = path.resolve(import.meta.dirname, '..');
const stamp = '2026-10-28T10:00:00.000001Z';
const changed = '2026-10-28T10:00:00.000002Z';

// Real import engine, with ONLY server environment boundaries substituted:
// a local DB, no-op page guard (not called by processProductBatch), and a
// deterministic translator. All planning, permission policy and writes are real.
async function engine(house, db, translation = false) {
  globalThis.__reviewDb = db;
  const rel = house === 'health' ? 'lib/operator/importEngine.js' : 'lib/beauty/operator/importEngine.js';
  let src = fs.readFileSync(path.join(root, rel), 'utf8');
  const translatedSource = fs.readFileSync(path.join(root, 'lib/operator/importTranslate.js'), 'utf8')
    .replace(/import "server-only";/, '')
    .replace(/import \{ translateProductFieldsWithCloudflare \} from "[^"]+";/, `const translateProductFieldsWithCloudflare = async () => ({ ok: true, translations: { tg: { name: 'machine translated', description: 'generated' }, fa: { name: 'generated', description: 'generated' }, ru: { name: 'generated', description: 'generated' } } });`);
  const translateUrl = `data:text/javascript;base64,${Buffer.from(translatedSource).toString('base64')}`;
  src = src.replace(/import "server-only";/, '')
    .replace(/import \{ getAdminClient \} from "[^"]+";/, 'const getAdminClient = () => globalThis.__reviewDb;')
    .replace(/import \{ require(?:Health|Beauty)Session \} from "[^"]+";/, 'const requireHealthSession = async () => {}; const requireBeautySession = async () => {};')
    .replace(/import \{ fillTranslationsForWrites \} from "[^"]+";/, `import { fillTranslationsForWrites } from ${JSON.stringify(translateUrl)};`)
    .replace(/from "(@\/[^"\n]+|\.\.[^"\n]+)"/g, (_, spec) => {
      let p = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(root, path.dirname(rel), spec);
      if (!path.extname(p)) p += '.js';
      return `from ${JSON.stringify(pathToFileURL(p).href)}`;
    });
  return import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}#${house}-${translation}`);
}

for (const house of ['health', 'beauty']) {
  const products = house === 'health' ? 'products' : 'beauty_products';
  const categories = house === 'health' ? 'categories' : 'beauty_categories';
  const quotes = house === 'health' ? 'quote_requests' : 'beauty_quote_requests';
  const documents = house === 'health' ? 'product_documents' : 'beauty_product_documents';
  const versions = house === 'health' ? 'product_versions' : 'beauty_product_versions';

  test(`${house} R1: draft documents must not live in an already-public image bucket`, () => {
    // Migration 06/10 sets these buckets public=true and SELECT USING(bucket_id=...).
    assert.ok(!['product-images', 'beauty-product-images'].includes(DOC_BUCKETS[house]), 'private row RLS does not protect files in a public bucket');
  });

  test(`${house} R2: an unsuccessful audit attempt must prevent irreversible document deletion`, async () => {
    const db = createMemoryAdmin({ [documents]: [{ id: 1, product_id: 1, version: 1, updated_at: stamp, file_path: 'documents/test.pdf' }] });
    let removed = false;
    db.storage = { from: () => ({ remove: async () => { removed = true; return { error: null }; } }) };
    const res = await deleteDocument({ admin: db, panel: house, evaluate: async () => ({ mode: 'direct' }), audit: async () => ({ ok: false, unavailable: true }) }, 1, 1);
    assert.equal(res.ok, false, 'must fail closed when the audit writer reports failure');
    assert.equal(db.tables[documents].length, 1);
    assert.equal(removed, false);
  });

  test(`${house} R3: approved quote deletion must atomically reject a row changed after the snapshot read`, async () => {
    const db = createMemoryAdmin({ [quotes]: [{ id: 1, tracking_code: 'TEST', updated_at: stamp, status: 'new' }] });
    const res = await executeApprovedQuoteDelete({ admin: db, house,
      request: { proposed: { _ids: [1], _versions: { 1: stamp } } }, session: { sid: 'review' },
      audit: async (entry) => {
        if (entry.action === 'quote.delete_attempt') Object.assign(db.tables[quotes][0], { status: 'answered', updated_at: changed });
        return { ok: true };
      },
    });
    assert.equal(res.ok, false, 'a concurrent answer must not be deleted by an approval for the old row');
    assert.equal(db.tables[quotes].length, 1);
  });

  test(`${house} R4: an image referenced by a restorable version is still in use`, async () => {
    const seed = { [products]: [{ id: 1, sku: 'S', image_url: 'products/current.webp', gallery_urls: [] }], [categories]: [], operator_change_requests: [],
      [versions]: [{ id: 1, product_id: 1, before: { image_url: 'products/old.webp' }, after: { image_url: 'products/current.webp' } }] };
    if (house === 'beauty') seed.beauty_brands = [];
    const db = createMemoryAdmin(seed);
    let removed = false;
    db.storage = { from: () => ({ remove: async (paths) => { removed = true; return { data: paths.map(name => ({ name })), error: null }; } }) };
    const res = await deleteMedia(db, house, { bucket: DOC_BUCKETS[house], path: 'products/old.webp' });
    assert.equal(res.ok, false, 'restoring a version must not restore a deleted image path');
    assert.equal(removed, false);
  });

  test(`${house} R5: import must honor separate price/publication restrictions`, async () => {
    const actor = { id: 'review-user', role: 'product_manager', status: 'active', houses: [house], allow: [], deny: [] };
    assert.equal(decide(actor, house, 'products.import').mode, 'direct');
    assert.equal(decide(actor, house, 'products.price').mode, 'approval');
    assert.equal(decide(actor, house, 'products.publish').mode, 'approval');
    const db = createMemoryAdmin({ [products]: [{ id: 1, sku: 'S', slug: 's', price: 10, is_active: false }], [categories]: [], publish_rules: [] });
    const mod = await engine(house, db);
    const res = await mod.processProductBatch([{ sku: 'S', name_en: 'Test', price: '999', is_active: 'yes' }], { mode: 'update', dryRun: false });
    assert.equal(res.ok, true);
    // commitProductRows currently gates ONLY products.import, which was direct above.
    assert.equal(db.tables[products][0].price, 10, 'direct import must not directly change an approval-only price');
    assert.equal(db.tables[products][0].is_active, false);
  });

  test(`${house} R6: import updates must record per-product before/after history`, async () => {
    const db = createMemoryAdmin({ [products]: [{ id: 1, sku: 'S', slug: 's', name_en: 'Old', updated_at: stamp }], [categories]: [], [versions]: [], publish_rules: [] });
    const mod = await engine(house, db);
    const res = await mod.processProductBatch([{ sku: 'S', name_en: 'New' }], { mode: 'update', dryRun: false });
    assert.equal(res.ok, true);
    assert.equal(db.tables[products][0].name_en, 'New');
    assert.ok(db.tables[versions].length > 0, 'an import summary is not a restorable product version');
  });

  test(`${house} R7: generated import translations must be marked automatic`, async () => {
    const db = createMemoryAdmin({ [products]: [], [categories]: [], publish_rules: [] });
    const mod = await engine(house, db, true);
    const res = await mod.processProductBatch([{ sku: 'NEW', name_en: 'Source' }], { mode: 'add', autoTranslate: true, dryRun: false });
    assert.equal(res.ok, true);
    assert.equal(db.tables[products][0].name_tg, 'machine translated');
    assert.equal(db.tables[products][0].translation_meta?.name_tg, 'auto');
  });

  test(`${house} R8: a customer file labeled full must include more than 1000 requests`, async () => {
    const db = createMemoryAdmin({ [quotes]: Array.from({ length: 1100 }, (_, i) => ({ id: i + 1, phone: '123456789', phone_key: '123456789', status: 'new', created_at: new Date(1_700_000_000_000 + i * 1000).toISOString() })) }, { maxRows: 1000 });
    const res = await readQuotesPage(db, house, parseQuoteParams({}), { now: Date.parse('2026-10-28') });
    assert.equal(res.ok, true);
    assert.equal(res.customerFile, 'full');
    assert.equal(res.related.length, 1100, 'silent truncation is not a full customer file');
  });

  test(`${house} R9: category deletion must plan every product past the API row cap`, async () => {
    const db = createMemoryAdmin({ [categories]: [{ id: 1, slug: 'one' }, { id: 2, slug: 'two' }], [products]: Array.from({ length: 1100 }, (_, i) => ({ id: i + 1, category_id: 1, category: 'one' })) }, { maxRows: 1000 });
    const res = await planCategoryDelete({ admin: db, house, id: 1, moveToId: 2 });
    assert.equal(res.ok, true);
    assert.equal(res.plan.count, 1100, 'a deletion plan must not lose the last 100 products');
  });

  test(`${house} R11: bulk publication must validate the resulting row including the category patch`, async () => {
    const db = createMemoryAdmin({ [products]: [{ id: 1, sku: 'S', is_active: false, category_id: 1, category: 'one' }], publish_rules: [{ house, blocking: ['category'], version: 1 }] });
    const res = await applyBulkChange({ admin: db, house, ids: [1], allowed: { is_active: true, category_id: null, category: null } });
    assert.equal(db.tables[products][0].is_active, false, 'cannot remove a required category while making the product public');
    assert.equal(res.ok, false);
  });
}

test('R10: category approval must reject changed membership even when its count stays the same', async () => {
  const db = createMemoryAdmin({ categories: [{ id: 1, slug: 'one' }, { id: 2, slug: 'two' }], products: [{ id: 2, category_id: 1, category: 'one' }] });
  // The request saw product id=1; it was moved out and id=2 was moved in.
  // Current request format stores only count and slug, so it cannot detect it.
  const res = await executeApprovedCategoryDelete({ admin: db, house: 'health',
    request: { entity_id: 1, before: { slug: 'one', products: 1 }, proposed: { moveToId: 2 } }, audit: async () => ({ ok: true }),
  });
  assert.equal(res.ok, false, 'same count is not the same set/version of products');
  assert.equal(db.tables.categories.length, 2);
});
