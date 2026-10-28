// lib/operator/approvable.js — what happens to a request AFTER it was filed, per kind of operation: which ones the requester can ask again
// (rejected / stale) and how the fresh basis is read. The list of operations that can be filed at all is APPROVABLE_OPERATIONS in authz.js.
// Plain module.
export const RESUBMITTABLE_OPERATIONS = [
  "products.create", "products.content", "products.price", "products.stock_flag", "products.publish", "products.archive", "products.delete", "products.restore_version",
  "categories.delete", "brands.delete", "quotes.delete",
];
// A file deletion and a stock correction are not asked again by pressing a button: the first needs the file to be looked at again, the second
// is a fresh adjustment against today's balance. The screen shows no "ask again" for them.
export const canResubmit = (operation) => RESUBMITTABLE_OPERATIONS.includes(operation);

const DESTRUCTIVE = ["categories.delete", "brands.delete", "quotes.delete"];

// → prepare(request) for approvals.resubmitRequest
export function prepareFor({ product, destructive }) {
  return async (request) => {
    const op = String(request.operation);
    if (op.startsWith("products.")) return product(request);
    if (DESTRUCTIVE.includes(op)) return destructive(request);
    return { error: "unsupported" };
  };
}
