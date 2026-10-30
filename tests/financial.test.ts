/**
 * Automated test suite for MyFlow financial logic and repositories.
 * Uses Node.js built-in SQLite engine to test against actual SQLite operations.
 * Verifies all 10 mandatory financial test cases.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseExecutor } from '@/db/types';
import { migrateDatabase, seedDefaultData } from '@/db/schema';
import {
  getAccounts,
  getAccountById,
  createAccount,
  getTotalBalancePaise,
} from '@/db/accountsRepository';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  getTransactions,
  getTransactionById,
} from '@/db/transactionsRepository';
import {
  getDashboardSummary,
  getMonthlyIncomeExpense,
} from '@/db/dashboardRepository';

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
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      rawDb.exec('BEGIN TRANSACTION;');
      try {
        await task();
        rawDb.exec('COMMIT;');
      } catch (err) {
        rawDb.exec('ROLLBACK;');
        throw err;
      }
    },
  };

  return { executor, rawDb };
}

describe('MyFlow Financial Engine & Repositories', () => {
  it('Case 1: Creating an expense decreases the appropriate account balance', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Initial cash balance is 0. Give it 5000 paise (₹50)
    await executor.runAsync("UPDATE accounts SET balance_paise = 5000 WHERE id = 'acc_cash';");

    await createTransaction(executor, {
      type: 'expense',
      amountPaise: 2000, // ₹20
      accountId: 'acc_cash',
      categoryId: 'cat_food',
      description: 'Lunch',
      date: '2026-10-28',
    });

    const cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 3000, 'Cash balance should decrease from 5000 to 3000 paise');
  });

  it('Case 2: Creating income increases the appropriate account balance', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await createTransaction(executor, {
      type: 'income',
      amountPaise: 150000, // ₹1,500
      accountId: 'acc_bank',
      categoryId: 'cat_salary',
      description: 'Freelance payment',
      date: '2026-10-28',
    });

    const bank = await getAccountById(executor, 'acc_bank');
    assert.strictEqual(bank?.balancePaise, 150000, 'Bank balance should increase by 150000 paise');
  });

  it('Case 3: Transfers decrease one account and increase another without changing combined funds', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Seed balances: Cash = 10000, Bank = 20000 (Total = 30000)
    await executor.runAsync("UPDATE accounts SET balance_paise = 10000 WHERE id = 'acc_cash';");
    await executor.runAsync("UPDATE accounts SET balance_paise = 20000 WHERE id = 'acc_bank';");

    const totalBefore = await getTotalBalancePaise(executor);
    assert.strictEqual(totalBefore, 30000, 'Combined balance before transfer');

    // Transfer 4000 from Bank to Cash
    await createTransaction(executor, {
      type: 'transfer',
      amountPaise: 4000,
      accountId: 'acc_bank',
      toAccountId: 'acc_cash',
      description: 'ATM withdrawal',
      date: '2026-10-28',
    });

    const bank = await getAccountById(executor, 'acc_bank');
    const cash = await getAccountById(executor, 'acc_cash');
    const totalAfter = await getTotalBalancePaise(executor);

    assert.strictEqual(bank?.balancePaise, 16000, 'Source account should decrease by 4000');
    assert.strictEqual(cash?.balancePaise, 14000, 'Destination account should increase by 4000');
    assert.strictEqual(totalAfter, 30000, 'Combined total funds must remain strictly unchanged');
  });

  it('Case 4: Transfers do not count as income or expenses', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await createTransaction(executor, {
      type: 'transfer',
      amountPaise: 50000,
      accountId: 'acc_bank',
      toAccountId: 'acc_cash',
      description: 'Transfer funds',
      date: '2026-10-28',
    });

    const summary = await getMonthlyIncomeExpense(executor, '2026-10');
    assert.strictEqual(summary.incomePaise, 0, 'Transfers must not count as income');
    assert.strictEqual(summary.expensePaise, 0, 'Transfers must not count as expense');
  });

  it('Case 5: Monthly income and expense totals exclude transfers', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Add Income
    await createTransaction(executor, {
      type: 'income',
      amountPaise: 100000, // ₹1,000
      accountId: 'acc_bank',
      categoryId: 'cat_salary',
      description: 'Salary',
      date: '2026-10-10',
    });

    // Add Expense
    await createTransaction(executor, {
      type: 'expense',
      amountPaise: 30000, // ₹300
      accountId: 'acc_cash',
      categoryId: 'cat_groceries',
      description: 'Weekly groceries',
      date: '2026-10-12',
    });

    // Add Transfer (must not alter monthly totals)
    await createTransaction(executor, {
      type: 'transfer',
      amountPaise: 25000, // ₹250
      accountId: 'acc_bank',
      toAccountId: 'acc_cash',
      description: 'Transfer to cash',
      date: '2026-10-15',
    });

    const summary = await getMonthlyIncomeExpense(executor, '2026-10');
    assert.strictEqual(summary.incomePaise, 100000, 'Monthly income should strictly equal 100000 paise');
    assert.strictEqual(summary.expensePaise, 30000, 'Monthly expense should strictly equal 30000 paise');
  });

  it('Case 6: Editing a transaction does not double-count its previous value', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 10000 WHERE id = 'acc_cash';");

    const tx = await createTransaction(executor, {
      type: 'expense',
      amountPaise: 2000, // ₹20
      accountId: 'acc_cash',
      categoryId: 'cat_food',
      description: 'Coffee',
      date: '2026-10-28',
    });

    let cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 8000, 'Balance after initial expense');

    // Edit transaction: change amount to 3500 paise (₹35)
    await updateTransaction(executor, tx.id, {
      type: 'expense',
      amountPaise: 3500,
      accountId: 'acc_cash',
      categoryId: 'cat_food',
      description: 'Coffee and pastry',
      date: '2026-10-28',
    });

    cash = await getAccountById(executor, 'acc_cash');
    // Balance was 10000 - 3500 = 6500 paise
    assert.strictEqual(cash?.balancePaise, 6500, 'Balance after editing expense should be 6500, not double-counted');

    const updatedTx = await getTransactionById(executor, tx.id);
    assert.strictEqual(updatedTx?.amountPaise, 3500);
    assert.strictEqual(updatedTx?.description, 'Coffee and pastry');
  });

  it('Case 7: Deleting a transaction reverses its financial effect', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 10000 WHERE id = 'acc_cash';");

    const tx = await createTransaction(executor, {
      type: 'expense',
      amountPaise: 4000,
      accountId: 'acc_cash',
      categoryId: 'cat_shopping',
      description: 'Book',
      date: '2026-10-28',
    });

    let cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 6000, 'Balance after expense should be 6000');

    // Delete transaction
    await deleteTransaction(executor, tx.id);

    cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 10000, 'Deleting expense must fully restore balance to 10000');

    const fetched = await getTransactionById(executor, tx.id);
    assert.strictEqual(fetched, null, 'Deleted transaction should no longer exist');
  });

  it('Case 8: Invalid amounts are rejected', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Negative amount
    await assert.rejects(
      async () => {
        await createTransaction(executor, {
          type: 'expense',
          amountPaise: -500,
          accountId: 'acc_cash',
          categoryId: 'cat_food',
          description: 'Invalid negative',
          date: '2026-10-28',
        });
      },
      /positive integer in paise/,
      'Should reject negative amounts'
    );

    // Zero amount
    await assert.rejects(
      async () => {
        await createTransaction(executor, {
          type: 'expense',
          amountPaise: 0,
          accountId: 'acc_cash',
          categoryId: 'cat_food',
          description: 'Zero amount',
          date: '2026-10-28',
        });
      },
      /positive integer in paise/,
      'Should reject zero amount'
    );

    // Fractional amount (non-integer paise)
    await assert.rejects(
      async () => {
        await createTransaction(executor, {
          type: 'expense',
          amountPaise: 12.5,
          accountId: 'acc_cash',
          categoryId: 'cat_food',
          description: 'Float amount',
          date: '2026-10-28',
        });
      },
      /positive integer in paise/,
      'Should reject non-integer paise'
    );

    // Same source and destination transfer
    await assert.rejects(
      async () => {
        await createTransaction(executor, {
          type: 'transfer',
          amountPaise: 1000,
          accountId: 'acc_cash',
          toAccountId: 'acc_cash',
          description: 'Self transfer',
          date: '2026-10-28',
        });
      },
      /Source and destination accounts must be different/,
      'Should reject self-transfer'
    );
  });

  it('Case 9: Records persist after database reinitialization and application restart', async () => {
    const { executor } = createInMemoryExecutor();
    // First startup: migrate and seed
    await migrateDatabase(executor);

    await createTransaction(executor, {
      type: 'income',
      amountPaise: 75000,
      accountId: 'acc_bank',
      categoryId: 'cat_salary',
      description: 'Contract payment',
      date: '2026-10-28',
    });

    const accountsBefore = await getAccounts(executor);
    const txBefore = await getTransactions(executor);

    // Simulate second app restart / reinitialization
    await migrateDatabase(executor);

    const accountsAfter = await getAccounts(executor);
    const txAfter = await getTransactions(executor);

    assert.strictEqual(accountsAfter.length, accountsBefore.length, 'Account count must not duplicate on restart');
    assert.strictEqual(txAfter.length, txBefore.length, 'Transactions must persist without duplication');
    assert.strictEqual(txAfter[0].amountPaise, 75000);
  });

  it('Case 10: Empty databases display sensible empty states', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // No transactions created yet
    const summary = await getDashboardSummary(executor, '2026-10');
    assert.strictEqual(summary.totalBalancePaise, 0);
    assert.strictEqual(summary.monthlyIncomePaise, 0);
    assert.strictEqual(summary.monthlyExpensePaise, 0);
    assert.strictEqual(summary.totalOwedToYouPaise, 0);
    assert.strictEqual(summary.totalYouOwePaise, 0);
    assert.strictEqual(summary.recentTransactions.length, 0);
    assert(summary.accounts.length >= 3, 'Default accounts should be seeded');

    const allTx = await getTransactions(executor);
    assert.strictEqual(allTx.length, 0, 'No transactions in empty database');
  });
});
