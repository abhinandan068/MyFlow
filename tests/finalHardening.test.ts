/**
 * Automated Test Suite for Final Hardening — MyFlow
 * Tests:
 * 1. CSV escaping and formatting (RFC-4180 compliance: commas, quotes, line breaks).
 * 2. Full backup serialization and structure validation.
 * 3. Incompatible/malformed backup rejection.
 * 4. Restore execution in Replace mode (atomic replacement, topological order).
 * 5. Restore execution in Merge mode (preserves existing, deduplicates).
 * 6. Failed restore rollback (transaction abort preserves original data).
 * 7. Account deletion prevention when dependent transactions or loans exist.
 * 8. Protection of default system categories from deletion.
 * 9. Custom category deletion preserves historical transactions with null category fallback.
 * 10. Reminder time parsing and format validation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseExecutor } from '@/db/types';
import { migrateDatabase } from '@/db/schema';
import {
  createAccount,
  getAccounts,
  getAccountById,
  deleteAccount,
  getAccountDependentCounts,
} from '@/db/accountsRepository';
import {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
} from '@/db/categoriesRepository';
import {
  createTransaction,
  getTransactions,
} from '@/db/transactionsRepository';
import { createPerson } from '@/db/peopleRepository';
import { createLoan, createRepayment } from '@/db/loansRepository';
import {
  escapeCSVCell,
  generateTransactionsCSV,
  createFullBackupPayload,
  validateBackupPayload,
  executeRestore,
  FullBackupPayload,
} from '@/db/backupRepository';
import { parseTimeString } from '@/utils/date';

function flattenParams(params: any[]): any[] {
  if (params.length === 1 && Array.isArray(params[0])) {
    return params[0];
  }
  return params;
}

function createInMemoryExecutor(): { executor: DatabaseExecutor; rawDb: DatabaseSync } {
  const rawDb = new DatabaseSync(':memory:');

  const executor: DatabaseExecutor = {
    async execAsync(source: string): Promise<void> {
      rawDb.exec(source);
    },
    async runAsync(source: string, ...params: any[]): Promise<{ lastInsertRowId: number; changes: number }> {
      const flat = flattenParams(params);
      const stmt = rawDb.prepare(source);
      const res = stmt.run(...flat);
      return {
        lastInsertRowId: Number(res.lastInsertRowid),
        changes: Number(res.changes),
      };
    },
    async getFirstAsync<T = any>(source: string, ...params: any[]): Promise<T | null> {
      const flat = flattenParams(params);
      const stmt = rawDb.prepare(source);
      const row = stmt.get(...flat);
      return (row as T) ?? null;
    },
    async getAllAsync<T = any>(source: string, ...params: any[]): Promise<T[]> {
      const flat = flattenParams(params);
      const stmt = rawDb.prepare(source);
      const rows = stmt.all(...flat);
      return rows as T[];
    },
    async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
      rawDb.exec('BEGIN TRANSACTION;');
      try {
        const result = await task();
        rawDb.exec('COMMIT;');
        return result;
      } catch (err) {
        rawDb.exec('ROLLBACK;');
        throw err;
      }
    },
  };

  return { executor, rawDb };
}

describe('MyFlow Final Hardening & Data Portability Suite', () => {
  it('1. CSV cell escaping and formatting adheres strictly to RFC-4180', () => {
    // Normal string
    assert.strictEqual(escapeCSVCell('Groceries'), 'Groceries');
    // String with comma
    assert.strictEqual(escapeCSVCell('Milk, Eggs, Bread'), '"Milk, Eggs, Bread"');
    // String with double quotes
    assert.strictEqual(escapeCSVCell('Super "Mega" Market'), '"Super ""Mega"" Market"');
    // String with line breaks
    assert.strictEqual(escapeCSVCell("Line 1\nLine 2"), '"Line 1\nLine 2"');
    // Null and undefined
    assert.strictEqual(escapeCSVCell(null), '');
    assert.strictEqual(escapeCSVCell(undefined), '');
    // Numbers
    assert.strictEqual(escapeCSVCell(12345), '12345');

    // Test full CSV generation
    const sampleRows = [
      {
        id: 'tx_1',
        date: '2026-10-28',
        type: 'expense',
        amount_paise: 150000,
        account_name: 'Main Bank',
        category_name: 'Food & Dining',
        description: 'Dinner, Drinks & Desert',
        note: 'Shared with "Alice"',
        to_account_name: null,
        created_at: '2026-10-28T19:00:00Z',
      },
    ];

    const csv = generateTransactionsCSV(sampleRows);
    assert.ok(csv.includes('"Dinner, Drinks & Desert"'));
    assert.ok(csv.includes('"Shared with ""Alice"""'));
    assert.ok(csv.includes('1500.00'));
    assert.ok(csv.includes('150000'));
  });

  it('2. Backup payload creation and validation', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Add some test data
    await createAccount(executor, {
      name: 'Test Savings',
      type: 'bank',
      balancePaise: 500000,
    });

    const payload = await createFullBackupPayload(executor);

    assert.strictEqual(payload.metadata.appName, 'MyFlow');
    assert.strictEqual(payload.metadata.schemaVersion, 1);
    assert.ok(payload.data.accounts.length >= 4); // 3 defaults + 1 new
    assert.ok(payload.data.categories.length >= 16); // default categories

    const validation = validateBackupPayload(payload);
    assert.strictEqual(validation.valid, true);
  });

  it('3. Rejection of malformed, foreign app, or future version backups', () => {
    // Foreign app
    const foreign = {
      metadata: { appName: 'OtherFinanceApp', schemaVersion: 1 },
      data: {},
    };
    assert.strictEqual(validateBackupPayload(foreign).valid, false);

    // Incompatible future schema version
    const future = {
      metadata: { appName: 'MyFlow', schemaVersion: 999 },
      data: {},
    };
    assert.strictEqual(validateBackupPayload(future).valid, false);

    // Missing data tables
    const incomplete = {
      metadata: { appName: 'MyFlow', schemaVersion: 1 },
      data: { accounts: [] }, // missing transactions, etc.
    };
    assert.strictEqual(validateBackupPayload(incomplete).valid, false);

    // Invalid JSON structure
    assert.strictEqual(validateBackupPayload(null).valid, false);
    assert.strictEqual(validateBackupPayload('string').valid, false);
  });

  it('4. Restore in Replace mode atomically restores all records', async () => {
    const { executor: sourceDb } = createInMemoryExecutor();
    await migrateDatabase(sourceDb);

    // Create unique records in sourceDb
    const customAcc = await createAccount(sourceDb, {
      name: 'Custom Swiss Account',
      type: 'bank',
      balancePaise: 999900,
    });

    const p = await createPerson(sourceDb, { name: 'Kavita Roy' });
    await createLoan(sourceDb, {
      personId: p.id,
      accountId: customAcc.id,
      type: 'lent',
      principalPaise: 250000,
      description: 'Lent to Kavita',
      date: '2026-10-20',
    });

    await createTransaction(sourceDb, {
      accountId: customAcc.id,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 50000,
      description: 'Lunch at Cafe',
      date: '2026-10-21',
    });

    const backup = await createFullBackupPayload(sourceDb);

    // Create targetDb with different initial state
    const { executor: targetDb } = createInMemoryExecutor();
    await migrateDatabase(targetDb);

    // Perform atomic replace
    const result = await executeRestore(targetDb, backup, 'replace');
    assert.strictEqual(result.success, true);

    // Verify targetDb now matches backup
    const restoredAcc = await getAccountById(targetDb, customAcc.id);
    assert.ok(restoredAcc);
    assert.strictEqual(restoredAcc.name, 'Custom Swiss Account');
    assert.strictEqual(restoredAcc.balancePaise, 699900); // 999,900 - 250,000 (lent) - 50,000 (expense)

    const txs = await getTransactions(targetDb);
    const restoredTx = txs.find((t) => t.description === 'Lunch at Cafe');
    assert.ok(restoredTx);
    assert.strictEqual(restoredTx.amountPaise, 50000);
  });

  it('5. Restore in Merge mode preserves existing non-duplicate records', async () => {
    const { executor: sourceDb } = createInMemoryExecutor();
    await migrateDatabase(sourceDb);

    const acc1 = await createAccount(sourceDb, {
      name: 'Source Account',
      type: 'bank',
      balancePaise: 100000,
    });

    const backup = await createFullBackupPayload(sourceDb);

    // Target database has its own records
    const { executor: targetDb } = createInMemoryExecutor();
    await migrateDatabase(targetDb);

    const targetAcc = await createAccount(targetDb, {
      name: 'Target Account',
      type: 'cash',
      balancePaise: 200000,
    });

    const result = await executeRestore(targetDb, backup, 'merge');
    assert.strictEqual(result.success, true);

    // Target account should still exist
    const preserved = await getAccountById(targetDb, targetAcc.id);
    assert.ok(preserved);
    assert.strictEqual(preserved.name, 'Target Account');

    // Source account should now also exist
    const merged = await getAccountById(targetDb, acc1.id);
    assert.ok(merged);
    assert.strictEqual(merged.name, 'Source Account');
  });

  it('6. Failed restore rolls back cleanly without corrupting data', async () => {
    const { executor: targetDb } = createInMemoryExecutor();
    await migrateDatabase(targetDb);

    const initialAccounts = await getAccounts(targetDb);
    const initialCount = initialAccounts.length;

    // Create a malformed payload where transactions have an invalid foreign key or bad data
    const corruptedPayload: FullBackupPayload = {
      metadata: {
        appName: 'MyFlow',
        version: '1.0.0',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        recordCounts: {
          accounts: 1,
          categories: 0,
          transactions: 1,
          persons: 0,
          loans: 0,
          loanRepayments: 0,
          budgets: 0,
        },
      },
      data: {
        accounts: [
          {
            id: 'acc_corrupt',
            name: 'Corrupt',
            type: 'bank',
            balance_paise: 0,
            color: '#fff',
            icon: 'wallet',
            is_default: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        categories: [],
        persons: [],
        budgets: [],
        transactions: [
          {
            id: 'bad_tx',
            type: 'INVALID_TYPE_THAT_VIOLATES_CHECK', // Violates CHECK(type IN ('income','expense','transfer'))
            amount_paise: 100,
            account_id: 'acc_corrupt',
            date: '2026-10-28',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        loans: [],
        loanRepayments: [],
        settings: [],
      },
    };

    // Execution should throw and rollback
    await assert.rejects(async () => {
      await executeRestore(targetDb, corruptedPayload, 'replace');
    });

    // Verify existing target accounts were NOT destroyed or corrupted
    const afterFailedAccounts = await getAccounts(targetDb);
    assert.strictEqual(afterFailedAccounts.length, initialCount);
  });

  it('7. Account deletion prevention when dependent records exist', async () => {
    const { executor: db } = createInMemoryExecutor();
    await migrateDatabase(db);

    // Create new account
    const acc = await createAccount(db, {
      name: 'Salary Checking',
      type: 'bank',
      balancePaise: 1000000,
    });

    // 0 dependents initially
    let deps = await getAccountDependentCounts(db, acc.id);
    assert.strictEqual(deps.totalDependents, 0);

    // Add a transaction linked to this account
    await createTransaction(db, {
      accountId: acc.id,
      categoryId: 'cat_salary',
      type: 'income',
      amountPaise: 500000,
      description: 'Monthly Bonus',
      date: '2026-10-28',
    });

    deps = await getAccountDependentCounts(db, acc.id);
    assert.strictEqual(deps.transactionsCount, 1);
    assert.strictEqual(deps.totalDependents, 1);

    // Deleting account with dependents must fail with descriptive message
    await assert.rejects(async () => {
      await deleteAccount(db, acc.id);
    }, /Cannot delete account "Salary Checking" because it is linked to 1 transaction/);
  });

  it('8. Default system categories are protected from deletion', async () => {
    const { executor: db } = createInMemoryExecutor();
    await migrateDatabase(db);

    // Attempting to delete default food category should throw
    await assert.rejects(async () => {
      await deleteCategory(db, 'cat_food');
    }, /Default system categories cannot be deleted/);
  });

  it('9. Custom category deletion succeeds and preserves historical transactions', async () => {
    const { executor: db } = createInMemoryExecutor();
    await migrateDatabase(db);

    // Create custom category
    const customCat = await createCategory(db, {
      name: 'Pet Expenses',
      type: 'expense',
      color: '#FB7185',
      icon: 'paw',
    });

    // Create transaction in this custom category
    const tx = await createTransaction(db, {
      accountId: 'acc_bank',
      categoryId: customCat.id,
      type: 'expense',
      amountPaise: 120000,
      description: 'Cat Food',
      date: '2026-10-28',
    });

    // Delete custom category
    await deleteCategory(db, customCat.id);

    // Category should be gone
    const cats = await getCategories(db);
    assert.strictEqual(cats.some((c) => c.id === customCat.id), false);

    // Historical transaction must NOT be deleted (ON DELETE SET NULL)
    const txs = await getTransactions(db);
    const existingTx = txs.find((t) => t.id === tx.id);
    assert.ok(existingTx);
    assert.strictEqual(existingTx.categoryId, null);
  });

  it('10. Reminder time parsing utility operates cleanly with boundary checks', () => {
    assert.deepStrictEqual(parseTimeString('21:00'), { hour: 21, minute: 0 });
    assert.deepStrictEqual(parseTimeString('08:30'), { hour: 8, minute: 30 });
    assert.deepStrictEqual(parseTimeString('00:15'), { hour: 0, minute: 15 });
    // Out of bounds / invalid fallback
    assert.deepStrictEqual(parseTimeString('invalid'), { hour: 21, minute: 0 });
    assert.deepStrictEqual(parseTimeString('99:99'), { hour: 21, minute: 0 });
  });
});
