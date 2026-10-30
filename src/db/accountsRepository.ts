  /**
 * Accounts repository for MyFlow.
 * Handles database operations for user accounts with integer paise balances.
 */
import { Account, AccountType } from '../types';
import { DatabaseExecutor } from './types';
import { generateId } from '../utils/id';

interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  balance_paise: number;
  color: string;
  icon: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

function mapRowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    balancePaise: row.balance_paise,
    color: row.color,
    icon: row.icon,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAccounts(db: DatabaseExecutor): Promise<Account[]> {
  const rows = await db.getAllAsync<AccountRow>(
    `SELECT id, name, type, balance_paise, color, icon, is_default, created_at, updated_at
     FROM accounts
     ORDER BY is_default DESC, name ASC;`
  );
  return rows.map(mapRowToAccount);
}

export async function getAccountById(
  db: DatabaseExecutor,
  id: string
): Promise<Account | null> {
  const row = await db.getFirstAsync<AccountRow>(
    `SELECT id, name, type, balance_paise, color, icon, is_default, created_at, updated_at
     FROM accounts
     WHERE id = ?;`,
    [id]
  );
  return row ? mapRowToAccount(row) : null;
}

export async function createAccount(
  db: DatabaseExecutor,
  data: {
    id?: string;
    name: string;
    type: AccountType;
    balancePaise?: number;
    color?: string;
    icon?: string;
    isDefault?: boolean;
  }
): Promise<Account> {
  const id = data.id || `acc_${generateId()}`;
  const now = new Date().toISOString();
  const balancePaise = data.balancePaise ?? 0;
  const color = data.color || '#B5A0FF';
  const icon = data.icon || 'wallet';
  const isDefault = data.isDefault ? 1 : 0;

  await db.runAsync(
    `INSERT INTO accounts (id, name, type, balance_paise, color, icon, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, data.name.trim(), data.type, balancePaise, color, icon, isDefault, now, now]
  );

  return {
    id,
    name: data.name.trim(),
    type: data.type,
    balancePaise,
    color,
    icon,
    isDefault: Boolean(isDefault),
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateAccount(
  db: DatabaseExecutor,
  id: string,
  updates: Partial<Omit<Account, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    params.push(updates.name.trim());
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    params.push(updates.type);
  }
  if (updates.balancePaise !== undefined) {
    fields.push('balance_paise = ?');
    params.push(updates.balancePaise);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    params.push(updates.color);
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    params.push(updates.icon);
  }
  if (updates.isDefault !== undefined) {
    fields.push('is_default = ?');
    params.push(updates.isDefault ? 1 : 0);
  }

  params.push(id);
  await db.runAsync(
    `UPDATE accounts SET ${fields.join(', ')} WHERE id = ?;`,
    params
  );
}

export interface AccountDependentCounts {
  transactionsCount: number;
  loansCount: number;
  repaymentsCount: number;
  totalDependents: number;
}

export async function getAccountDependentCounts(
  db: DatabaseExecutor,
  id: string
): Promise<AccountDependentCounts> {
  const txRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions WHERE account_id = ? OR to_account_id = ?;',
    [id, id]
  );
  const loanRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM loans WHERE account_id = ?;',
    [id]
  );
  const repRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM loan_repayments WHERE account_id = ?;',
    [id]
  );

  const transactionsCount = txRow?.count ?? 0;
  const loansCount = loanRow?.count ?? 0;
  const repaymentsCount = repRow?.count ?? 0;
  const totalDependents = transactionsCount + loansCount + repaymentsCount;

  return {
    transactionsCount,
    loansCount,
    repaymentsCount,
    totalDependents,
  };
}

export async function deleteAccount(
  db: DatabaseExecutor,
  id: string
): Promise<void> {
  const acc = await getAccountById(db, id);
  if (!acc) {
    throw new Error(`Account not found: ${id}`);
  }

  const { totalDependents, transactionsCount, loansCount, repaymentsCount } =
    await getAccountDependentCounts(db, id);

  if (totalDependents > 0) {
    const details = [];
    if (transactionsCount > 0) details.push(`${transactionsCount} transaction(s)`);
    if (loansCount > 0) details.push(`${loansCount} loan(s)`);
    if (repaymentsCount > 0) details.push(`${repaymentsCount} repayment(s)`);

    throw new Error(
      `Cannot delete account "${acc.name}" because it is linked to ${details.join(', ')}. Please delete or reassign them first to preserve financial records.`
    );
  }

  // Ensure user cannot delete their last remaining account
  const countRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts;'
  );
  if (countRow && countRow.count <= 1) {
    throw new Error('Cannot delete your only account. At least one account must be kept.');
  }

  await db.runAsync('DELETE FROM accounts WHERE id = ?;', [id]);
}

export async function getTotalBalancePaise(
  db: DatabaseExecutor
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT COALESCE(SUM(balance_paise), 0) as total FROM accounts;'
  );
  return row?.total ?? 0;
}
