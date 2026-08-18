# Medoria Health category tree

This branch adds a reversible, database-backed Health taxonomy for wholesale buyers.

## Shape

- 14 top-level departments
- 68 seeded level-2 groups
- optional level-3 groups created from the operator panel
- maximum depth: 3
- products are assigned only to leaf categories

The original six category slugs (`gloves`, `masks`, `instruments`, `wound`, `diagnostics`, `lab`) are preserved and re-parented. Existing product relations and URLs are not rewritten.

## Initial visibility

The five departments containing the six existing categories start active. All newly seeded groups start inactive, so the public catalog does not publish empty sections automatically. The operator can enable one node or a complete subtree.

## Database rollout

Run in order:

1. `migrations/20_health_category_tree_schema.sql`
2. `migrations/21_health_category_tree_clinical.sql`
3. `migrations/22_health_category_tree_care.sql`

All three are idempotent. They do not delete products.

## Rollback

Use `docs/HEALTH_CATEGORY_TREE_ROLLBACK.sql`. It restores the six legacy categories as roots and removes only unused seeded rows. It never deletes products or operator-created categories.

## Not changed

- public visual system and card styling
- Beauty taxonomy or imagery
- production DNS, Vercel or Supabase data
- Docker/self-hosting files
