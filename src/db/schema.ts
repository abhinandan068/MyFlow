/**
 * SQLite database setup for MyFlow.
 * Uses expo-sqlite (SDK 58 API: useSQLiteContext / SQLiteProvider).
 * All schema migrations are versioned and idempotent.
 */
import * as SQLite from 'expo-sqlite';
import { DatabaseExecutor } from './types';

export const DB_NAME = 'myflow.db';

/**
 * Run all DDL migrations in order.
 * Each block is idempotent.
 */
export async function migrateDatabase(db: SQLite.SQLiteDatabase | DatabaseExecutor): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('bank','upi','cash','credit','other')),
      balance_paise INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#B5A0FF',
      icon TEXT NOT NULL DEFAULT 'wallet',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'tag',
      color TEXT NOT NULL DEFAULT '#A1A1AA',
      type TEXT NOT NULL CHECK(type IN ('income','expense','both')),
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense','transfer')),
      amount_paise INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      to_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      note TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS persons (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      avatar_color TEXT NOT NULL DEFAULT '#B5A0FF',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY NOT NULL,
      person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('lent','borrowed')),
      principal_paise INTEGER NOT NULL,
      repaid_paise INTEGER NOT NULL DEFAULT 0,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      description TEXT NOT NULL DEFAULT '',
      note TEXT,
      date TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      is_closed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loan_repayments (
      id TEXT PRIMARY KEY NOT NULL,
      loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
      amount_paise INTEGER NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      note TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      limit_paise INTEGER NOT NULL,
      month TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(category_id, month)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  // Column upgrade migrations
  try {
    const txCols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(transactions);'
    );
    if (txCols.length > 0 && !txCols.some((c) => c.name === 'description')) {
      await db.execAsync(
        "ALTER TABLE transactions ADD COLUMN description TEXT NOT NULL DEFAULT '';"
      );
    }
  } catch {}

  try {
    const personCols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(persons);'
    );
    if (personCols.length > 0) {
      if (!personCols.some((c) => c.name === 'notes')) {
        await db.execAsync('ALTER TABLE persons ADD COLUMN notes TEXT;');
      }
      if (!personCols.some((c) => c.name === 'updated_at')) {
        await db.execAsync("ALTER TABLE persons ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';");
      }
    }
  } catch {}

  try {
    const loanCols = await db.getAllAsync<{ name: string }>(
      'PRAGMA table_info(loans);'
    );
    if (loanCols.length > 0) {
      if (!loanCols.some((c) => c.name === 'description')) {
        await db.execAsync("ALTER TABLE loans ADD COLUMN description TEXT NOT NULL DEFAULT '';");
      }
      if (!loanCols.some((c) => c.name === 'date')) {
        await db.execAsync("ALTER TABLE loans ADD COLUMN date TEXT NOT NULL DEFAULT '';");
      }
    }
  } catch {}

  // Indexes for high performance
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_loans_person ON loans(person_id);
    CREATE INDEX IF NOT EXISTS idx_loans_type ON loans(type);
    CREATE INDEX IF NOT EXISTS idx_loans_is_closed ON loans(is_closed);
    CREATE INDEX IF NOT EXISTS idx_loan_repayments_loan ON loan_repayments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
  `);

  // Seed default data if not already seeded
  await seedDefaultData(db);
}

export async function seedDefaultData(db: DatabaseExecutor): Promise<void> {
  const now = new Date().toISOString();

  // 1. Seed accounts if none exist
  const existingAccounts = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts'
  );
  if (!existingAccounts || existingAccounts.count === 0) {
    const defaultAccounts = [
      { id: 'acc_cash', name: 'Cash', type: 'cash', balance_paise: 0, color: '#4ADE80', icon: 'cash', is_default: 1 },
      { id: 'acc_bank', name: 'Main Bank', type: 'bank', balance_paise: 0, color: '#60A5FA', icon: 'business', is_default: 0 },
      { id: 'acc_upi', name: 'UPI / Card', type: 'upi', balance_paise: 0, color: '#B5A0FF', icon: 'phone-portrait', is_default: 0 },
    ];
    for (const acc of defaultAccounts) {
      await db.runAsync(
        `INSERT OR IGNORE INTO accounts (id, name, type, balance_paise, color, icon, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [acc.id, acc.name, acc.type, acc.balance_paise, acc.color, acc.icon, acc.is_default, now, now]
      );
    }
  }

  // 2. Seed categories if none exist
  const existingCategories = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM categories'
  );
  if (!existingCategories || existingCategories.count === 0) {
    const systemCategories = [
      // Expense categories
      { id: 'cat_food', name: 'Food & Dining', icon: 'restaurant', color: '#FB923C', type: 'expense' },
      { id: 'cat_transport', name: 'Transport', icon: 'car', color: '#60A5FA', type: 'expense' },
      { id: 'cat_shopping', name: 'Shopping', icon: 'bag', color: '#F472B6', type: 'expense' },
      { id: 'cat_bills', name: 'Bills & Utilities', icon: 'flash', color: '#FBBF24', type: 'expense' },
      { id: 'cat_health', name: 'Health', icon: 'medical', color: '#34D399', type: 'expense' },
      { id: 'cat_education', name: 'Education', icon: 'school', color: '#818CF8', type: 'expense' },
      { id: 'cat_entertainment', name: 'Entertainment', icon: 'film', color: '#E879F9', type: 'expense' },
      { id: 'cat_groceries', name: 'Groceries', icon: 'basket', color: '#A3E635', type: 'expense' },
      { id: 'cat_rent', name: 'Rent', icon: 'home', color: '#FB7185', type: 'expense' },
      { id: 'cat_emi', name: 'EMI / Loan', icon: 'card', color: '#F97316', type: 'expense' },
      { id: 'cat_misc_exp', name: 'Miscellaneous', icon: 'ellipsis-horizontal', color: '#A1A1AA', type: 'expense' },
      // Income categories
      { id: 'cat_salary', name: 'Salary', icon: 'briefcase', color: '#4ADE80', type: 'income' },
      { id: 'cat_freelance', name: 'Freelance', icon: 'laptop', color: '#2DD4BF', type: 'income' },
      { id: 'cat_investment', name: 'Investment Returns', icon: 'trending-up', color: '#A78BFA', type: 'income' },
      { id: 'cat_gift', name: 'Gift', icon: 'gift', color: '#F472B6', type: 'income' },
      { id: 'cat_misc_inc', name: 'Other Income', icon: 'add-circle', color: '#4ADE80', type: 'income' },
    ];

    for (const cat of systemCategories) {
      await db.runAsync(
        `INSERT OR IGNORE INTO categories (id, name, icon, color, type, is_system, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [cat.id, cat.name, cat.icon, cat.color, cat.type, now]
      );
    }
  }

  // 3. Seed default settings
  const defaultSettings: [string, string][] = [
    ['currency', 'INR'],
    ['notificationsEnabled', 'true'],
    ['reminderTime', '21:00'],
  ];
  for (const [key, value] of defaultSettings) {
    await db.runAsync(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }
}
