/**
 * Transactions repository for MyFlow.
 * Handles database operations for income, expense, and transfer records.
 * Follows strict financial rules:
 * - Integer paise precision (no floating-point math).
 * - ACID SQLite transactions for balance updates.
 * - Safe reversal on edit/delete.
 * - Transfers do NOT affect income or expense totals.
 */
import {
  TransactionWithDetails,
  CreateTransactionInput,
  TransactionFilter,
} from '../types';
import { DatabaseExecutor } from './types';
import { generateId } from '../utils/id';

interface TransactionRow {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount_paise: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  description: string;
  note: string | null;
  date: string;
  created_at: string;
  updated_at: string;
  account_name: string;
  account_color: string;
  account_icon: string;
  to_account_name: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

function mapRowToTransaction(row: TransactionRow): TransactionWithDetails {
  return {
    id: row.id,
    type: row.type,
    amountPaise: row.amount_paise,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    categoryId: row.category_id,
    description: row.description,
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    accountName: row.account_name ?? 'Unknown Account',
    accountColor: row.account_color ?? '#B5A0FF',
    accountIcon: row.account_icon ?? 'wallet',
    toAccountName: row.to_account_name,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
  };
}

export function validateTransactionInput(input: CreateTransactionInput): void {
  if (
    typeof input.amountPaise !== 'number' ||
    !Number.isInteger(input.amountPaise) ||
    input.amountPaise <= 0
  ) {
    throw new Error('Amount must be a positive integer in paise (greater than 0)');
  }

  if (!input.description || !input.description.trim()) {
    throw new Error('Description is required');
  }

  if (!input.accountId || !input.accountId.trim()) {
    throw new Error('Account is required');
  }

  if (!input.date || !input.date.trim()) {
    throw new Error('Date is required');
  }

  if (input.type === 'transfer') {
    if (!input.toAccountId || !input.toAccountId.trim()) {
      throw new Error('Destination account is required for transfers');
    }
    if (input.accountId.trim() === input.toAccountId.trim()) {
      throw new Error('Source and destination accounts must be different');
    }
  } else {
    if (!input.categoryId || !input.categoryId.trim()) {
      throw new Error('Category is required for income and expense transactions');
    }
  }
}

export async function createTransaction(
  db: DatabaseExecutor,
  input: CreateTransactionInput
): Promise<TransactionWithDetails> {
  validateTransactionInput(input);

  const id = input.id || `tx_${generateId()}`;
  const now = new Date().toISOString();
  const description = input.description.trim();
  const note = input.note?.trim() || null;
  const toAccountId = input.type === 'transfer' ? input.toAccountId! : null;
  const categoryId = input.type === 'transfer' ? null : input.categoryId!;

  await db.withTransactionAsync(async () => {
    // 1. Verify source account exists
    const sourceAccount = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM accounts WHERE id = ?;',
      [input.accountId]
    );
    if (!sourceAccount) {
      throw new Error(`Account not found: ${input.accountId}`);
    }

    // 2. If transfer, verify destination account exists
    if (input.type === 'transfer') {
      const destAccount = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM accounts WHERE id = ?;',
        [toAccountId]
      );
      if (!destAccount) {
        throw new Error(`Destination account not found: ${toAccountId}`);
      }
    }

    // 3. Update account balances
    if (input.type === 'expense') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
    } else if (input.type === 'income') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
    } else if (input.type === 'transfer') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, toAccountId]
      );
    }

    // 4. Insert transaction record
    await db.runAsync(
      `INSERT INTO transactions (id, type, amount_paise, account_id, to_account_id, category_id, description, note, date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        input.type,
        input.amountPaise,
        input.accountId,
        toAccountId,
        categoryId,
        description,
        note,
        input.date,
        now,
        now,
      ]
    );
  });

  const created = await getTransactionById(db, id);
  if (!created) {
    throw new Error('Failed to retrieve newly created transaction');
  }
  return created;
}

export async function deleteTransaction(
  db: DatabaseExecutor,
  id: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{
      id: string;
      type: 'income' | 'expense' | 'transfer';
      amount_paise: number;
      account_id: string;
      to_account_id: string | null;
    }>('SELECT id, type, amount_paise, account_id, to_account_id FROM transactions WHERE id = ?;', [
      id,
    ]);

    if (!row) {
      throw new Error(`Transaction not found: ${id}`);
    }

    const now = new Date().toISOString();

    // Reverse financial effects safely
    if (row.type === 'expense') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [row.amount_paise, now, row.account_id]
      );
    } else if (row.type === 'income') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [row.amount_paise, now, row.account_id]
      );
    } else if (row.type === 'transfer') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [row.amount_paise, now, row.account_id]
      );
      if (row.to_account_id) {
        await db.runAsync(
          'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
          [row.amount_paise, now, row.to_account_id]
        );
      }
    }

    // Delete transaction record
    await db.runAsync('DELETE FROM transactions WHERE id = ?;', [id]);
  });
}

export async function updateTransaction(
  db: DatabaseExecutor,
  id: string,
  input: CreateTransactionInput
): Promise<TransactionWithDetails> {
  validateTransactionInput(input);

  const now = new Date().toISOString();
  const description = input.description.trim();
  const note = input.note?.trim() || null;
  const toAccountId = input.type === 'transfer' ? input.toAccountId! : null;
  const categoryId = input.type === 'transfer' ? null : input.categoryId!;

  await db.withTransactionAsync(async () => {
    const oldRow = await db.getFirstAsync<{
      id: string;
      type: 'income' | 'expense' | 'transfer';
      amount_paise: number;
      account_id: string;
      to_account_id: string | null;
    }>('SELECT id, type, amount_paise, account_id, to_account_id FROM transactions WHERE id = ?;', [
      id,
    ]);

    if (!oldRow) {
      throw new Error(`Transaction not found: ${id}`);
    }

    // 1. Reverse previous effects
    if (oldRow.type === 'expense') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [oldRow.amount_paise, now, oldRow.account_id]
      );
    } else if (oldRow.type === 'income') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [oldRow.amount_paise, now, oldRow.account_id]
      );
    } else if (oldRow.type === 'transfer') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [oldRow.amount_paise, now, oldRow.account_id]
      );
      if (oldRow.to_account_id) {
        await db.runAsync(
          'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
          [oldRow.amount_paise, now, oldRow.to_account_id]
        );
      }
    }

    // 2. Apply new effects
    if (input.type === 'expense') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
    } else if (input.type === 'income') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
    } else if (input.type === 'transfer') {
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, toAccountId]
      );
    }

    // 3. Update transaction row
    await db.runAsync(
      `UPDATE transactions
       SET type = ?, amount_paise = ?, account_id = ?, to_account_id = ?, category_id = ?, description = ?, note = ?, date = ?, updated_at = ?
       WHERE id = ?;`,
      [
        input.type,
        input.amountPaise,
        input.accountId,
        toAccountId,
        categoryId,
        description,
        note,
        input.date,
        now,
        id,
      ]
    );
  });

  const updated = await getTransactionById(db, id);
  if (!updated) {
    throw new Error('Failed to retrieve updated transaction');
  }
  return updated;
}

export async function getTransactionById(
  db: DatabaseExecutor,
  id: string
): Promise<TransactionWithDetails | null> {
  const query = `
    SELECT
      t.id, t.type, t.amount_paise, t.account_id, t.to_account_id, t.category_id,
      t.description, t.note, t.date, t.created_at, t.updated_at,
      a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
      ta.name AS to_account_name,
      c.name AS category_name, c.icon AS category_icon, c.color AS category_color
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.id = ?;
  `;
  const row = await db.getFirstAsync<TransactionRow>(query, [id]);
  return row ? mapRowToTransaction(row) : null;
}

export async function getTransactions(
  db: DatabaseExecutor,
  filter?: TransactionFilter
): Promise<TransactionWithDetails[]> {
  const whereClauses: string[] = ['1=1'];
  const params: any[] = [];

  if (filter?.type) {
    whereClauses.push('t.type = ?');
    params.push(filter.type);
  }

  if (filter?.accountId) {
    whereClauses.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(filter.accountId, filter.accountId);
  }

  if (filter?.categoryId) {
    whereClauses.push('t.category_id = ?');
    params.push(filter.categoryId);
  }

  if (filter?.startDate) {
    whereClauses.push('t.date >= ?');
    params.push(filter.startDate);
  }

  if (filter?.endDate) {
    whereClauses.push('t.date <= ?');
    params.push(filter.endDate);
  }

  if (filter?.search && filter.search.trim()) {
    const term = `%${filter.search.trim()}%`;
    whereClauses.push('(t.description LIKE ? OR t.note LIKE ? OR c.name LIKE ?)');
    params.push(term, term, term);
  }

  let limitClause = '';
  if (filter?.limit !== undefined) {
    limitClause += ' LIMIT ?';
    params.push(filter.limit);
    if (filter?.offset !== undefined) {
      limitClause += ' OFFSET ?';
      params.push(filter.offset);
    }
  }

  const query = `
    SELECT
      t.id, t.type, t.amount_paise, t.account_id, t.to_account_id, t.category_id,
      t.description, t.note, t.date, t.created_at, t.updated_at,
      a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
      ta.name AS to_account_name,
      c.name AS category_name, c.icon AS category_icon, c.color AS category_color
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY t.date DESC, t.created_at DESC
    ${limitClause};
  `;

  const rows = await db.getAllAsync<TransactionRow>(query, params);
  return rows.map(mapRowToTransaction);
}

export async function getRecentTransactions(
  db: DatabaseExecutor,
  limit = 10
): Promise<TransactionWithDetails[]> {
  return getTransactions(db, { limit });
}
