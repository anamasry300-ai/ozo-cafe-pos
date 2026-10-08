import { db, round } from './db.js';

export const PRODUCT_SELECT = `
SELECT p.*, c.name AS category_name,
  COALESCE((SELECT SUM(ri.quantity * i.purchase_price)
            FROM recipe_items ri JOIN ingredients i ON i.id = ri.ingredient_id
            WHERE ri.product_id = p.id), 0) AS recipe_cost,
  (SELECT COUNT(*) FROM recipe_items ri WHERE ri.product_id = p.id) AS recipe_count
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
`;

export function productCost(row) {
  return round(row.recipe_count > 0 ? row.recipe_cost : row.manual_cost);
}

export function productView(row) {
  const cost = productCost(row);
  const price = round(row.price);
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    category_name: row.category_name,
    price,
    manual_cost: round(row.manual_cost),
    cost,
    margin: round(price - cost),
    margin_percent: price > 0 ? round(((price - cost) / price) * 100) : 0,
    has_recipe: row.recipe_count > 0,
    description: row.description,
    image: row.image,
    active: !!row.active,
    created_at: row.created_at,
  };
}

export function getProduct(id) {
  const row = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(id);
  return row ? productView(row) : null;
}

export function listProducts({ categoryId, activeOnly = false, q = '' } = {}) {
  const where = [];
  const params = [];
  if (categoryId) { where.push('p.category_id = ?'); params.push(categoryId); }
  if (activeOnly) where.push('p.active = 1');
  if (q) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const sql = PRODUCT_SELECT + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY p.id';
  return db.prepare(sql).all(...params).map(productView);
}

export function getRecipe(productId) {
  return db.prepare(`
    SELECT ri.id, ri.ingredient_id, ri.quantity, i.name AS ingredient_name, i.unit,
           i.purchase_price, ROUND(ri.quantity * i.purchase_price, 2) AS line_cost
    FROM recipe_items ri
    JOIN ingredients i ON i.id = ri.ingredient_id
    WHERE ri.product_id = ?
    ORDER BY ri.id
  `).all(productId);
}

export function ingredientStockDelta(ingredientId, delta, type, { refType = null, refId = null, notes = '', userId = null } = {}) {
  const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredientId);
  if (!ing) throw new Error('المادة الخام غير موجودة');
  const after = round(Number(ing.quantity) + Number(delta));
  if (after < -0.0001) {
    throw new Error(`الكمية غير كافية من "${ing.name}" (المتاح: ${ing.quantity})`);
  }
  db.prepare('UPDATE ingredients SET quantity = ? WHERE id = ?').run(after, ingredientId);
  db.prepare(`
    INSERT INTO inventory_transactions (ingredient_id, type, delta, quantity_after, ref_type, ref_id, notes, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ingredientId, type, round(delta), after, refType, refId, notes, userId);
  return after;
}
