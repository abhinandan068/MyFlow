/**
 * Budgets repository for MyFlow.
 * Handles monthly budget management for expense categories with:
 * - Positive integer paise limits
 * - Real-time qualifying expense aggregation
 * - Remaining balance and percentage calculations
 * - Over-budget and approaching-limit indicators
 * - Duplicate budget prevention per category and month
 */
import {
  Budget,
  BudgetWithDetails,
  CreateBudgetInput,
  UpdateBudgetInput,
  MonthlyBudgetSummary,
} from '../types';
import { DatabaseExecutor } from './types';
import { generateId } from '../utils/id';
import { monthRange, currentMonth } from '../utils/date';

interface BudgetRow {
  id: string;
  category_id: string;
  limit_paise: number;
  month: string;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
  spent_paise?: number | null;
  tx_count?: number | null;
}

export function validateBudgetLimit(limitPaise: number): void {
  if (
    typeof limitPaise !== 'number' ||
    !Number.isInteger(limitPaise) ||
    limitPaise <= 0
  ) {
    throw new Error('Budget limit must be a positive integer in paise (greater than 0)');
  }
}

export async function createBudget(
  db: DatabaseExecutor,
  input: CreateBudgetInput
): Promise<BudgetWithDetails> {
  validateBudgetLimit(input.limitPaise);

  if (!input.categoryId || !input.categoryId.trim()) {
    throw new Error('Category is required');
  }

  const ym = (input.month || currentMonth()).trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error('Month must be formatted as YYYY-MM');
  }

  // 1. Verify category exists and qualifies for expense budgeting
  const category = await db.getFirstAsync<{ id: string; name: string; type: string }>(
    'SELECT id, name, type FROM categories WHERE id = ?;',
    [input.categoryId]
  );
  if (!category) {
    throw new Error(`Category not found: ${input.categoryId}`);
  }
  if (category.type === 'income') {
    throw new Error('Budgets can only be created for expense or multi-type categories');
  }

  // 2. Prevent duplicate budgets for the same category and month
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM budgets WHERE category_id = ? AND month = ?;',
    [input.categoryId, ym]
  );
  if (existing) {
    throw new Error(
      `A budget for "${category.name}" in ${ym} already exists. Please edit the existing budget.`
    );
  }

  const id = input.id || `bgt_${generateId()}`;
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO budgets (id, category_id, limit_paise, month, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [id, input.categoryId, input.limitPaise, ym, now, now]
  );

  const created = await getBudgetById(db, id);
  if (!created) {
    throw new Error('Failed to retrieve newly created budget');
  }
  return created;
}

export async function updateBudget(
  db: DatabaseExecutor,
  id: string,
  input: UpdateBudgetInput
): Promise<BudgetWithDetails> {
  const current = await db.getFirstAsync<{
    id: string;
    category_id: string;
    month: string;
    limit_paise: number;
  }>('SELECT id, category_id, month, limit_paise FROM budgets WHERE id = ?;', [id]);
  if (!current) {
    throw new Error(`Budget not found: ${id}`);
  }

  if (input.limitPaise !== undefined) {
    validateBudgetLimit(input.limitPaise);
  }

  const categoryId = input.categoryId ? input.categoryId.trim() : current.category_id;
  const month = input.month ? input.month.trim() : current.month;

  if (input.month && !/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Month must be formatted as YYYY-MM');
  }

  // If category or month changed, verify duplicate does not exist
  if (categoryId !== current.category_id || month !== current.month) {
    const duplicate = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM budgets WHERE category_id = ? AND month = ? AND id != ?;',
      [categoryId, month, id]
    );
    if (duplicate) {
      throw new Error(`A budget for this category and month already exists`);
    }
  }

  const now = new Date().toISOString();
  const limitPaise = input.limitPaise !== undefined ? input.limitPaise : current.limit_paise;

  await db.runAsync(
    `UPDATE budgets
     SET limit_paise = ?, category_id = ?, month = ?, updated_at = ?
     WHERE id = ?;`,
    [limitPaise, categoryId, month, now, id]
  );

  const updated = await getBudgetById(db, id);
  if (!updated) {
    throw new Error('Failed to retrieve updated budget');
  }
  return updated;
}

export async function deleteBudget(
  db: DatabaseExecutor,
  id: string
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM budgets WHERE id = ?;',
    [id]
  );
  if (!existing) {
    throw new Error(`Budget not found: ${id}`);
  }

  await db.runAsync('DELETE FROM budgets WHERE id = ?;', [id]);
}

export async function getBudgetById(
  db: DatabaseExecutor,
  id: string
): Promise<BudgetWithDetails | null> {
  const row = await db.getFirstAsync<BudgetRow>(
    `SELECT b.id, b.category_id, b.limit_paise, b.month, b.created_at, b.updated_at,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM budgets b
     LEFT JOIN categories c ON b.category_id = c.id
     WHERE b.id = ?;`,
    [id]
  );
  if (!row) return null;

  const { start, end } = monthRange(row.month);

  // Compute qualifying spending exclusively for this expense category
  const spendRow = await db.getFirstAsync<{ spent_paise: number | null; tx_count: number | null }>(
    `SELECT COALESCE(SUM(amount_paise), 0) AS spent_paise,
            COUNT(*) AS tx_count
     FROM transactions
     WHERE type = 'expense'
       AND category_id = ?
       AND date >= ? AND date <= ?;`,
    [row.category_id, start, end]
  );

  const spentPaise = spendRow?.spent_paise ?? 0;
  const remainingPaise = row.limit_paise - spentPaise;
  const percentageUsed =
    row.limit_paise > 0 ? Math.round((spentPaise / row.limit_paise) * 100) : 0;
  const isExceeded = spentPaise > row.limit_paise;
  const isApproaching = percentageUsed >= 80 && !isExceeded;

  return {
    id: row.id,
    categoryId: row.category_id,
    limitPaise: row.limit_paise,
    month: row.month,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryName: row.category_name ?? 'Uncategorized',
    categoryIcon: row.category_icon ?? 'tag',
    categoryColor: row.category_color ?? '#A1A1AA',
    spentPaise,
    remainingPaise,
    percentageUsed,
    isExceeded,
    isApproaching,
    transactionCount: spendRow?.tx_count ?? 0,
  };
}

export async function getBudgetsForMonth(
  db: DatabaseExecutor,
  monthStr?: string
): Promise<BudgetWithDetails[]> {
  const ym = monthStr || currentMonth();
  const { start, end } = monthRange(ym);

  const query = `
    SELECT
      b.id, b.category_id, b.limit_paise, b.month, b.created_at, b.updated_at,
      c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
      COALESCE(s.spent_paise, 0) AS spent_paise,
      COALESCE(s.tx_count, 0) AS tx_count
    FROM budgets b
    LEFT JOIN categories c ON b.category_id = c.id
    LEFT JOIN (
      SELECT category_id,
             SUM(amount_paise) AS spent_paise,
             COUNT(*) AS tx_count
      FROM transactions
      WHERE type = 'expense'
        AND date >= ? AND date <= ?
      GROUP BY category_id
    ) s ON b.category_id = s.category_id
    WHERE b.month = ?
    ORDER BY (COALESCE(s.spent_paise, 0) > b.limit_paise) DESC,
             (CAST(COALESCE(s.spent_paise, 0) AS FLOAT) / b.limit_paise) DESC,
             c.name ASC;
  `;

  const rows = await db.getAllAsync<BudgetRow>(query, [start, end, ym]);

  return rows.map((r) => {
    const spent = r.spent_paise ?? 0;
    const remaining = r.limit_paise - spent;
    const percentage =
      r.limit_paise > 0 ? Math.round((spent / r.limit_paise) * 100) : 0;
    const isExceeded = spent > r.limit_paise;
    const isApproaching = percentage >= 80 && !isExceeded;

    return {
      id: r.id,
      categoryId: r.category_id,
      limitPaise: r.limit_paise,
      month: r.month,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      categoryName: r.category_name ?? 'Uncategorized',
      categoryIcon: r.category_icon ?? 'tag',
      categoryColor: r.category_color ?? '#A1A1AA',
      spentPaise: spent,
      remainingPaise: remaining,
      percentageUsed: percentage,
      isExceeded,
      isApproaching,
      transactionCount: r.tx_count ?? 0,
    };
  });
}

export async function getMonthlyBudgetSummary(
  db: DatabaseExecutor,
  monthStr?: string
): Promise<MonthlyBudgetSummary> {
  const ym = monthStr || currentMonth();
  const budgets = await getBudgetsForMonth(db, ym);

  let totalLimitPaise = 0;
  let totalSpentPaise = 0;

  for (const b of budgets) {
    totalLimitPaise += b.limitPaise;
    totalSpentPaise += b.spentPaise;
  }

  const totalRemainingPaise = totalLimitPaise - totalSpentPaise;
  const overallPercentage =
    totalLimitPaise > 0 ? Math.round((totalSpentPaise / totalLimitPaise) * 100) : 0;

  return {
    month: ym,
    totalLimitPaise,
    totalSpentPaise,
    totalRemainingPaise,
    overallPercentage,
    budgets,
  };
}
