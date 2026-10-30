/**
 * Categories repository for MyFlow.
 * Handles database operations for income and expense categories.
 */
import { Category } from '../types';
import { DatabaseExecutor } from './types';
import { generateId } from '../utils/id';

interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'both';
  is_system: number;
  created_at: string;
}

function mapRowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    type: row.type,
    isSystem: Boolean(row.is_system),
    createdAt: row.created_at,
  };
}

export async function getCategories(
  db: DatabaseExecutor,
  type?: 'income' | 'expense' | 'both'
): Promise<Category[]> {
  if (type) {
    const rows = await db.getAllAsync<CategoryRow>(
      `SELECT id, name, icon, color, type, is_system, created_at
       FROM categories
       WHERE type = ? OR type = 'both'
       ORDER BY is_system DESC, name ASC;`,
      [type]
    );
    return rows.map(mapRowToCategory);
  }

  const rows = await db.getAllAsync<CategoryRow>(
    `SELECT id, name, icon, color, type, is_system, created_at
     FROM categories
     ORDER BY is_system DESC, name ASC;`
  );
  return rows.map(mapRowToCategory);
}

export async function getCategoryById(
  db: DatabaseExecutor,
  id: string
): Promise<Category | null> {
  const row = await db.getFirstAsync<CategoryRow>(
    `SELECT id, name, icon, color, type, is_system, created_at
     FROM categories
     WHERE id = ?;`,
    [id]
  );
  return row ? mapRowToCategory(row) : null;
}

export async function createCategory(
  db: DatabaseExecutor,
  data: {
    id?: string;
    name: string;
    icon?: string;
    color?: string;
    type: 'income' | 'expense' | 'both';
    isSystem?: boolean;
  }
): Promise<Category> {
  const id = data.id || `cat_${generateId()}`;
  const now = new Date().toISOString();
  const icon = data.icon || 'tag';
  const color = data.color || '#A1A1AA';
  const isSystem = data.isSystem ? 1 : 0;

  await db.runAsync(
    `INSERT INTO categories (id, name, icon, color, type, is_system, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [id, data.name.trim(), icon, color, data.type, isSystem, now]
  );

  return {
    id,
    name: data.name.trim(),
    icon,
    color,
    type: data.type,
    isSystem: Boolean(isSystem),
    createdAt: now,
  };
}

export async function updateCategory(
  db: DatabaseExecutor,
  id: string,
  updates: {
    name?: string;
    icon?: string;
    color?: string;
    type?: 'income' | 'expense' | 'both';
  }
): Promise<void> {
  const fields: string[] = [];
  const params: any[] = [];

  if (updates.name !== undefined) {
    if (!updates.name.trim()) throw new Error('Category name cannot be empty');
    fields.push('name = ?');
    params.push(updates.name.trim());
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    params.push(updates.icon);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    params.push(updates.color);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    params.push(updates.type);
  }

  if (fields.length === 0) return;

  params.push(id);
  await db.runAsync(
    `UPDATE categories SET ${fields.join(', ')} WHERE id = ?;`,
    params
  );
}

export async function getCategoryUsageCount(
  db: DatabaseExecutor,
  id: string
): Promise<{ transactionsCount: number; budgetsCount: number }> {
  const txRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions WHERE category_id = ?;',
    [id]
  );
  const bgtRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM budgets WHERE category_id = ?;',
    [id]
  );

  return {
    transactionsCount: txRow?.count ?? 0,
    budgetsCount: bgtRow?.count ?? 0,
  };
}

export async function deleteCategory(
  db: DatabaseExecutor,
  id: string
): Promise<void> {
  const category = await getCategoryById(db, id);
  if (!category) {
    throw new Error(`Category not found: ${id}`);
  }

  if (category.isSystem) {
    throw new Error('Default system categories cannot be deleted.');
  }

  // Budgets cascade on delete; transactions have ON DELETE SET NULL, keeping historical transactions safe.
  await db.runAsync('DELETE FROM categories WHERE id = ?;', [id]);
}
