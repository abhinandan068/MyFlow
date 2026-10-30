/**
 * Pure Database Backup, CSV Formatting, and Restore Engine — MyFlow
 * Decoupled from native platform modules so it can be tested in standard Node environments.
 */
import { DatabaseExecutor } from './types';

export const CURRENT_BACKUP_SCHEMA_VERSION = 1;
export const APP_IDENTIFIER = 'MyFlow';

export interface BackupMetadata {
  appName: string;
  version: string;
  schemaVersion: number;
  exportedAt: string;
  recordCounts: {
    accounts: number;
    categories: number;
    transactions: number;
    persons: number;
    loans: number;
    loanRepayments: number;
    budgets: number;
  };
}

export interface BackupData {
  accounts: any[];
  categories: any[];
  transactions: any[];
  persons: any[];
  loans: any[];
  loanRepayments: any[];
  budgets: any[];
  settings: any[];
}

export interface FullBackupPayload {
  metadata: BackupMetadata;
  data: BackupData;
}

/**
 * Escape a single CSV cell according to RFC-4180:
 * Wrap in quotes if it contains commas, double quotes, or line breaks; escape internal quotes as "".
 */
export function escapeCSVCell(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV string from transactions list
 */
export function generateTransactionsCSV(rows: any[]): string {
  const headers = [
    'Transaction ID',
    'Date',
    'Type',
    'Amount (INR)',
    'Amount (Paise)',
    'Account',
    'Category',
    'Description',
    'Note',
    'Transfer Destination',
    'Created At',
  ];

  const csvLines = [headers.map(escapeCSVCell).join(',')];

  for (const r of rows) {
    const rupees = (Math.abs(r.amount_paise) / 100).toFixed(2);
    const line = [
      r.id,
      r.date,
      r.type,
      rupees,
      r.amount_paise,
      r.account_name ?? r.account_id,
      r.category_name ?? r.category_id ?? 'Uncategorized',
      r.description ?? '',
      r.note ?? '',
      r.to_account_name ?? r.to_account_id ?? '',
      r.created_at,
    ].map(escapeCSVCell);

    csvLines.push(line.join(','));
  }

  return csvLines.join('\r\n');
}

/**
 * Create a full serialized JSON backup from database tables
 */
export async function createFullBackupPayload(
  db: DatabaseExecutor
): Promise<FullBackupPayload> {
  const [
    accounts,
    categories,
    transactions,
    persons,
    loans,
    loanRepayments,
    budgets,
    settings,
  ] = await Promise.all([
    db.getAllAsync('SELECT * FROM accounts ORDER BY created_at ASC;'),
    db.getAllAsync('SELECT * FROM categories ORDER BY created_at ASC;'),
    db.getAllAsync('SELECT * FROM transactions ORDER BY date ASC, created_at ASC;'),
    db.getAllAsync('SELECT * FROM persons ORDER BY created_at ASC;'),
    db.getAllAsync('SELECT * FROM loans ORDER BY created_at ASC;'),
    db.getAllAsync('SELECT * FROM loan_repayments ORDER BY created_at ASC;'),
    db.getAllAsync('SELECT * FROM budgets ORDER BY month ASC, created_at ASC;'),
    db.getAllAsync('SELECT * FROM settings ORDER BY key ASC;'),
  ]);

  const metadata: BackupMetadata = {
    appName: APP_IDENTIFIER,
    version: '1.0.0',
    schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    recordCounts: {
      accounts: accounts.length,
      categories: categories.length,
      transactions: transactions.length,
      persons: persons.length,
      loans: loans.length,
      loanRepayments: loanRepayments.length,
      budgets: budgets.length,
    },
  };

  return {
    metadata,
    data: {
      accounts,
      categories,
      transactions,
      persons,
      loans,
      loanRepayments,
      budgets,
      settings,
    },
  };
}

/**
 * Validate backup payload structure and schema version
 */
export function validateBackupPayload(payload: any): {
  valid: boolean;
  error?: string;
  metadata?: BackupMetadata;
} {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Backup file is empty or not valid JSON' };
  }

  if (payload.metadata?.appName !== APP_IDENTIFIER) {
    return {
      valid: false,
      error: `Invalid application backup. Expected "${APP_IDENTIFIER}" backup file.`,
    };
  }

  if (
    typeof payload.metadata?.schemaVersion !== 'number' ||
    payload.metadata.schemaVersion > CURRENT_BACKUP_SCHEMA_VERSION
  ) {
    return {
      valid: false,
      error: `Unsupported backup version: ${payload.metadata?.schemaVersion}. Please update MyFlow.`,
    };
  }

  if (!payload.data || typeof payload.data !== 'object') {
    return { valid: false, error: 'Backup does not contain financial data' };
  }

  const requiredArrays = [
    'accounts',
    'categories',
    'transactions',
    'persons',
    'loans',
    'loanRepayments',
    'budgets',
  ];

  for (const arr of requiredArrays) {
    if (!Array.isArray(payload.data[arr])) {
      return {
        valid: false,
        error: `Corrupted backup payload: missing or invalid ${arr} dataset.`,
      };
    }
  }

  return { valid: true, metadata: payload.metadata };
}

/**
 * Restore data from a backup payload.
 * Runs atomically inside withTransactionAsync.
 */
export async function executeRestore(
  db: DatabaseExecutor,
  payload: FullBackupPayload,
  mode: 'replace' | 'merge'
): Promise<{ success: boolean; restoredCounts: Record<string, number> }> {
  const validation = validateBackupPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const { data } = payload;
  const counts: Record<string, number> = {
    accounts: 0,
    categories: 0,
    transactions: 0,
    persons: 0,
    loans: 0,
    loanRepayments: 0,
    budgets: 0,
  };

  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      // 1. Clear existing tables in safe reverse-dependency order
      await db.runAsync('DELETE FROM loan_repayments;');
      await db.runAsync('DELETE FROM loans;');
      await db.runAsync('DELETE FROM transactions;');
      await db.runAsync('DELETE FROM budgets;');
      await db.runAsync('DELETE FROM persons;');
      await db.runAsync('DELETE FROM categories;');
      await db.runAsync('DELETE FROM accounts;');

      // 2. Insert accounts
      for (const a of data.accounts) {
        await db.runAsync(
          `INSERT INTO accounts (id, name, type, balance_paise, color, icon, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            a.id,
            a.name,
            a.type,
            a.balance_paise,
            a.color,
            a.icon,
            a.is_default,
            a.created_at,
            a.updated_at,
          ]
        );
        counts.accounts++;
      }

      // 3. Insert categories
      for (const c of data.categories) {
        await db.runAsync(
          `INSERT INTO categories (id, name, icon, color, type, is_system, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [c.id, c.name, c.icon, c.color, c.type, c.is_system, c.created_at]
        );
        counts.categories++;
      }

      // 4. Insert persons
      for (const p of data.persons) {
        await db.runAsync(
          `INSERT INTO persons (id, name, phone, notes, avatar_color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            p.id,
            p.name,
            p.phone ?? null,
            p.notes ?? null,
            p.avatar_color,
            p.created_at,
            p.updated_at || p.created_at,
          ]
        );
        counts.persons++;
      }

      // 5. Insert budgets
      for (const b of data.budgets) {
        await db.runAsync(
          `INSERT INTO budgets (id, category_id, limit_paise, month, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [b.id, b.category_id, b.limit_paise, b.month, b.created_at, b.updated_at]
        );
        counts.budgets++;
      }

      // 6. Insert transactions
      for (const t of data.transactions) {
        await db.runAsync(
          `INSERT INTO transactions (id, type, amount_paise, account_id, to_account_id, category_id, description, note, date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            t.id,
            t.type,
            t.amount_paise,
            t.account_id,
            t.to_account_id ?? null,
            t.category_id ?? null,
            t.description ?? '',
            t.note ?? null,
            t.date,
            t.created_at,
            t.updated_at,
          ]
        );
        counts.transactions++;
      }

      // 7. Insert loans
      for (const l of data.loans) {
        await db.runAsync(
          `INSERT INTO loans (id, person_id, type, principal_paise, repaid_paise, account_id, description, note, date, due_date, is_closed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            l.id,
            l.person_id,
            l.type,
            l.principal_paise,
            l.repaid_paise,
            l.account_id,
            l.description ?? '',
            l.note ?? null,
            l.date ?? '',
            l.due_date ?? null,
            l.is_closed,
            l.created_at,
            l.updated_at,
          ]
        );
        counts.loans++;
      }

      // 8. Insert loan repayments
      for (const r of data.loanRepayments) {
        await db.runAsync(
          `INSERT INTO loan_repayments (id, loan_id, amount_paise, account_id, note, date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            r.id,
            r.loan_id,
            r.amount_paise,
            r.account_id,
            r.note ?? null,
            r.date,
            r.created_at,
          ]
        );
        counts.loanRepayments++;
      }

      // 9. Restore settings
      if (Array.isArray(data.settings)) {
        for (const s of data.settings) {
          await db.runAsync(
            `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);`,
            [s.key, s.value]
          );
        }
      }
    } else {
      // MERGE MODE: Insert non-duplicate records safely
      for (const a of data.accounts) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO accounts (id, name, type, balance_paise, color, icon, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            a.id,
            a.name,
            a.type,
            a.balance_paise,
            a.color,
            a.icon,
            a.is_default,
            a.created_at,
            a.updated_at,
          ]
        );
        if (res.changes > 0) counts.accounts++;
      }

      for (const c of data.categories) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO categories (id, name, icon, color, type, is_system, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [c.id, c.name, c.icon, c.color, c.type, c.is_system, c.created_at]
        );
        if (res.changes > 0) counts.categories++;
      }

      for (const p of data.persons) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO persons (id, name, phone, notes, avatar_color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            p.id,
            p.name,
            p.phone ?? null,
            p.notes ?? null,
            p.avatar_color,
            p.created_at,
            p.updated_at || p.created_at,
          ]
        );
        if (res.changes > 0) counts.persons++;
      }

      for (const b of data.budgets) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO budgets (id, category_id, limit_paise, month, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [b.id, b.category_id, b.limit_paise, b.month, b.created_at, b.updated_at]
        );
        if (res.changes > 0) counts.budgets++;
      }

      for (const t of data.transactions) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO transactions (id, type, amount_paise, account_id, to_account_id, category_id, description, note, date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            t.id,
            t.type,
            t.amount_paise,
            t.account_id,
            t.to_account_id ?? null,
            t.category_id ?? null,
            t.description ?? '',
            t.note ?? null,
            t.date,
            t.created_at,
            t.updated_at,
          ]
        );
        if (res.changes > 0) counts.transactions++;
      }

      for (const l of data.loans) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO loans (id, person_id, type, principal_paise, repaid_paise, account_id, description, note, date, due_date, is_closed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            l.id,
            l.person_id,
            l.type,
            l.principal_paise,
            l.repaid_paise,
            l.account_id,
            l.description ?? '',
            l.note ?? null,
            l.date ?? '',
            l.due_date ?? null,
            l.is_closed,
            l.created_at,
            l.updated_at,
          ]
        );
        if (res.changes > 0) counts.loans++;
      }

      for (const r of data.loanRepayments) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO loan_repayments (id, loan_id, amount_paise, account_id, note, date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            r.id,
            r.loan_id,
            r.amount_paise,
            r.account_id,
            r.note ?? null,
            r.date,
            r.created_at,
          ]
        );
        if (res.changes > 0) counts.loanRepayments++;
      }
    }
  });

  return { success: true, restoredCounts: counts };
}
