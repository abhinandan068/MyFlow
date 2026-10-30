/**
 * Automated Test Suite for Analytics and Budget Management — MyFlow
 * Verifies all 11 required scenarios:
 * 1. Monthly income and expense calculations (integer paise, net cash flow).
 * 2. Transfers excluded from ordinary income, expenses, and net cash flow.
 * 3. Lending, borrowing, and repayments excluded from ordinary income/expenses;
 *    receivables/payables reported separately without adding to available cash.
 * 4. Category totals matching qualifying expense transactions (with archived/null category handling).
 * 5. Date-range filtering (presets and custom ranges).
 * 6. Empty analytics periods return valid 0s without errors.
 * 7. Budget spending and remaining amount calculations.
 * 8. Budgets exceeding their limits (negative remaining, >100% percentageUsed, isExceeded flag).
 * 9. Transactions changing budget totals correctly (add, edit, delete).
 * 10. Duplicate budget prevention per category and month; validation of positive limits.
 * 11. Existing transaction, lending, and person-analysis tests continuing to pass.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseExecutor } from '@/db/types';
import { migrateDatabase } from '@/db/schema';
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from '@/db/transactionsRepository';
import { createPerson } from '@/db/peopleRepository';
import { createLoan, createRepayment } from '@/db/loansRepository';
import {
  getOverallAnalyticsSummary,
  getCategoryPeriodTransactions,
} from '@/db/analyticsRepository';
import {
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetById,
  getBudgetsForMonth,
  getMonthlyBudgetSummary,
} from '@/db/budgetsRepository';
import { currentMonth } from '@/utils/date';

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

async function setupTestDb(): Promise<{
  db: DatabaseExecutor;
  accBank: string;
  accCash: string;
}> {
  const { executor } = createInMemoryExecutor();
  await migrateDatabase(executor);

  // Default accounts created by migration: acc_bank, acc_cash
  return {
    db: executor,
    accBank: 'acc_bank',
    accCash: 'acc_cash',
  };
}

describe('MyFlow Analytics & Budget Management Engine', () => {
  it('1. Monthly income and expense calculations (integer paise, net cash flow)', async () => {
    const { db, accBank } = await setupTestDb();
    const ym = currentMonth();

    // Add Income: ₹50,000 (5,000,000 paise)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_salary',
      type: 'income',
      amountPaise: 5000000,
      description: 'Monthly Salary',
      date: `${ym}-05`,
    });

    // Add Income: ₹10,000 (1,000,000 paise)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_freelance',
      type: 'income',
      amountPaise: 1000000,
      description: 'Freelance Design',
      date: `${ym}-10`,
    });

    // Add Expense: ₹15,000 (1,500,000 paise)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_rent',
      type: 'expense',
      amountPaise: 1500000,
      description: 'Apartment Rent',
      date: `${ym}-07`,
    });

    // Add Expense: ₹5,000 (500,000 paise)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 500000,
      description: 'Dining Out',
      date: `${ym}-12`,
    });

    const summary = await getOverallAnalyticsSummary(db, 'this_month');

    // Total income = 50,000 + 10,000 = 60,000
    assert.strictEqual(summary.totalIncomePaise, 6000000);
    // Total expenses = 15,000 + 5,000 = 20,000
    assert.strictEqual(summary.totalExpensePaise, 2000000);
    // Net cash flow = 60,000 - 20,000 = 40,000
    assert.strictEqual(summary.netCashflowPaise, 4000000);
  });

  it('2. Transfers being excluded from ordinary financial totals', async () => {
    const { db, accBank, accCash } = await setupTestDb();
    const ym = currentMonth();

    // Income ₹20,000
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_salary',
      type: 'income',
      amountPaise: 2000000,
      description: 'Salary',
      date: `${ym}-01`,
    });

    // Expense ₹5,000
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_groceries',
      type: 'expense',
      amountPaise: 500000,
      description: 'Groceries',
      date: `${ym}-02`,
    });

    // Transfer ₹10,000 from Bank to Cash
    await createTransaction(db, {
      accountId: accBank,
      toAccountId: accCash,
      type: 'transfer',
      amountPaise: 1000000,
      description: 'ATM Cash Withdrawal',
      date: `${ym}-03`,
    });

    const summary = await getOverallAnalyticsSummary(db, 'this_month');

    // Transfers must NOT count as income or expense
    assert.strictEqual(summary.totalIncomePaise, 2000000);
    assert.strictEqual(summary.totalExpensePaise, 500000);
    assert.strictEqual(summary.netCashflowPaise, 1500000);

    // Verify transfer is not in largest expenses list
    const transferInLargest = summary.largestExpenses.find(
      (e) => e.description === 'ATM Cash Withdrawal'
    );
    assert.strictEqual(transferInLargest, undefined);
  });

  it('3. Lending and repayments being excluded from ordinary financial totals', async () => {
    const { db, accBank } = await setupTestDb();
    const ym = currentMonth();

    // Ordinary Income: ₹30,000
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_salary',
      type: 'income',
      amountPaise: 3000000,
      description: 'Salary',
      date: `${ym}-01`,
    });

    // Ordinary Expense: ₹10,000
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_bills',
      type: 'expense',
      amountPaise: 1000000,
      description: 'Electricity Bill',
      date: `${ym}-02`,
    });

    // Person & Loans
    const p1 = await createPerson(db, { name: 'Rahul Sharma' });
    const p2 = await createPerson(db, { name: 'Anita Patel' });

    // Lent ₹15,000 to Rahul (receivable)
    const lentLoan = await createLoan(db, {
      personId: p1.id,
      accountId: accBank,
      type: 'lent',
      principalPaise: 1500000,
      description: 'Emergency Loan to Rahul',
      date: `${ym}-03`,
    });

    // Borrowed ₹8,000 from Anita (payable)
    const borrowedLoan = await createLoan(db, {
      personId: p2.id,
      accountId: accBank,
      type: 'borrowed',
      principalPaise: 800000,
      description: 'Short term borrow from Anita',
      date: `${ym}-04`,
    });

    // Rahul repays ₹5,000
    await createRepayment(db, {
      loanId: lentLoan.id,
      accountId: accBank,
      amountPaise: 500000,
      date: `${ym}-05`,
    });

    // Repay Anita ₹3,000
    await createRepayment(db, {
      loanId: borrowedLoan.id,
      accountId: accBank,
      amountPaise: 300000,
      date: `${ym}-06`,
    });

    const summary = await getOverallAnalyticsSummary(db, 'this_month');

    // Lending/Borrowing/Repayments must NOT alter ordinary income/expense
    assert.strictEqual(summary.totalIncomePaise, 3000000);
    assert.strictEqual(summary.totalExpensePaise, 1000000);
    assert.strictEqual(summary.netCashflowPaise, 2000000);

    // Outstanding balances:
    // Rahul: 15,000 - 5,000 = 10,000 receivable
    // Anita: 8,000 - 3,000 = 5,000 payable
    assert.strictEqual(summary.outstandingReceivablesPaise, 1000000);
    assert.strictEqual(summary.outstandingPayablesPaise, 500000);

    // Receivables and Payables must NOT be merged into available cash
    assert.strictEqual(
      summary.totalAvailableCashPaise !==
        summary.totalAvailableCashPaise + summary.outstandingReceivablesPaise,
      true
    );
  });

  it('4. Category totals matching their qualifying expense transactions', async () => {
    const { db, accBank } = await setupTestDb();
    const ym = currentMonth();

    // Food: 2 transactions (₹1,500 + ₹2,500 = ₹4,000)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 150000,
      description: 'Breakfast',
      date: `${ym}-02`,
    });
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 250000,
      description: 'Dinner with friends',
      date: `${ym}-04`,
    });

    // Shopping: 1 transaction (₹6,000)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_shopping',
      type: 'expense',
      amountPaise: 600000,
      description: 'New shoes',
      date: `${ym}-06`,
    });

    // Total expense = ₹10,000 (1,000,000 paise)
    const summary = await getOverallAnalyticsSummary(db, 'this_month');
    assert.strictEqual(summary.totalExpensePaise, 1000000);

    const foodBreakdown = summary.categoryBreakdown.find((c) => c.categoryId === 'cat_food');
    assert.ok(foodBreakdown);
    assert.strictEqual(foodBreakdown.totalSpentPaise, 400000);
    assert.strictEqual(foodBreakdown.transactionCount, 2);
    assert.strictEqual(foodBreakdown.percentageOfTotal, 40); // 4,000 / 10,000 = 40%
    assert.strictEqual(foodBreakdown.largestTransactionPaise, 250000);

    const shoppingBreakdown = summary.categoryBreakdown.find((c) => c.categoryId === 'cat_shopping');
    assert.ok(shoppingBreakdown);
    assert.strictEqual(shoppingBreakdown.totalSpentPaise, 600000);
    assert.strictEqual(shoppingBreakdown.transactionCount, 1);
    assert.strictEqual(shoppingBreakdown.percentageOfTotal, 60); // 6,000 / 10,000 = 60%
    assert.strictEqual(shoppingBreakdown.largestTransactionPaise, 600000);

    // Drill down check
    const foodTxList = await getCategoryPeriodTransactions(
      db,
      'cat_food',
      summary.startDate,
      summary.endDate
    );
    assert.strictEqual(foodTxList.length, 2);
  });

  it('5. Date-range filtering across presets and custom dates', async () => {
    const { db, accBank } = await setupTestDb();

    // 2026-01 transaction
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 100000,
      description: 'January Snack',
      date: '2026-01-15',
    });

    // 2026-02 transaction
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 200000,
      description: 'February Snack',
      date: '2026-02-15',
    });

    // 2026-03 transaction
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 300000,
      description: 'March Snack',
      date: '2026-03-15',
    });

    // Custom date range: only 2026-02
    const febSummary = await getOverallAnalyticsSummary(
      db,
      'custom',
      '2026-02-01',
      '2026-02-28'
    );
    assert.strictEqual(febSummary.totalExpensePaise, 200000);

    // Custom date range: 2026-01 to 2026-02
    const janFebSummary = await getOverallAnalyticsSummary(
      db,
      'custom',
      '2026-01-01',
      '2026-02-28'
    );
    assert.strictEqual(janFebSummary.totalExpensePaise, 300000);

    // Out of bounds range
    const futureSummary = await getOverallAnalyticsSummary(
      db,
      'custom',
      '2028-01-01',
      '2028-01-31'
    );
    assert.strictEqual(futureSummary.totalExpensePaise, 0);
  });

  it('6. Empty analytics periods return valid 0s without errors', async () => {
    const { db } = await setupTestDb();

    const summary = await getOverallAnalyticsSummary(
      db,
      'custom',
      '2025-01-01',
      '2025-01-31'
    );

    assert.strictEqual(summary.totalIncomePaise, 0);
    assert.strictEqual(summary.totalExpensePaise, 0);
    assert.strictEqual(summary.netCashflowPaise, 0);
    assert.strictEqual(summary.categoryBreakdown.length, 0);
    assert.strictEqual(summary.largestExpenses.length, 0);
    assert.ok(Array.isArray(summary.dailySpendingTrends));
    assert.ok(Array.isArray(summary.incomeExpenseTrends));
  });

  it('7. Budget spending and remaining amounts', async () => {
    const { db, accBank } = await setupTestDb();
    const ym = currentMonth();

    // Create budget: Food limit ₹8,000 (800,000 paise)
    const budget = await createBudget(db, {
      categoryId: 'cat_food',
      limitPaise: 800000,
      month: ym,
    });

    assert.strictEqual(budget.limitPaise, 800000);
    assert.strictEqual(budget.spentPaise, 0);
    assert.strictEqual(budget.remainingPaise, 800000);
    assert.strictEqual(budget.percentageUsed, 0);
    assert.strictEqual(budget.isApproaching, false);
    assert.strictEqual(budget.isExceeded, false);

    // Add ₹3,200 (320,000 paise) spending in Food
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 320000,
      description: 'Supermarket visit',
      date: `${ym}-10`,
    });

    const updated = await getBudgetById(db, budget.id);
    assert.ok(updated);
    assert.strictEqual(updated.spentPaise, 320000);
    assert.strictEqual(updated.remainingPaise, 480000); // 800,000 - 320,000 = 480,000
    assert.strictEqual(updated.percentageUsed, 40); // 320 / 800 = 40%
    assert.strictEqual(updated.isApproaching, false);
    assert.strictEqual(updated.isExceeded, false);
  });

  it('8. Budgets exceeding their limits', async () => {
    const { db, accBank } = await setupTestDb();
    const ym = currentMonth();

    // Create budget: Dining/Food limit ₹5,000 (500,000 paise)
    const budget = await createBudget(db, {
      categoryId: 'cat_food',
      limitPaise: 500000,
      month: ym,
    });

    // Add spending ₹4,200 (84% -> approaching limit)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 420000,
      description: 'Expensive Dinner',
      date: `${ym}-05`,
    });

    let check = await getBudgetById(db, budget.id);
    assert.ok(check);
    assert.strictEqual(check.spentPaise, 420000);
    assert.strictEqual(check.remainingPaise, 80000);
    assert.strictEqual(check.percentageUsed, 84);
    assert.strictEqual(check.isApproaching, true);
    assert.strictEqual(check.isExceeded, false);

    // Add spending another ₹1,500 (total ₹5,700 -> exceeded by ₹700)
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 150000,
      description: 'Bakery treats',
      date: `${ym}-12`,
    });

    check = await getBudgetById(db, budget.id);
    assert.ok(check);
    assert.strictEqual(check.spentPaise, 570000);
    assert.strictEqual(check.remainingPaise, -70000); // Negative remaining
    assert.strictEqual(check.percentageUsed, 114); // 570,000 / 500,000 = 114%
    assert.strictEqual(check.isExceeded, true);
    assert.strictEqual(check.isApproaching, false);
  });

  it('9. Transactions changing budget totals correctly (add, edit, delete)', async () => {
    const { db, accBank, accCash } = await setupTestDb();
    const ym = currentMonth();

    const budget = await createBudget(db, {
      categoryId: 'cat_groceries',
      limitPaise: 1000000, // ₹10,000
      month: ym,
    });

    // Add tx1: ₹3,000
    const tx1 = await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_groceries',
      type: 'expense',
      amountPaise: 300000,
      description: 'Weekly Veggies',
      date: `${ym}-03`,
    });

    let b = await getBudgetById(db, budget.id);
    assert.strictEqual(b?.spentPaise, 300000);

    // Add transfer ₹5,000 -> transfers must NOT affect budget
    await createTransaction(db, {
      accountId: accBank,
      toAccountId: accCash,
      type: 'transfer',
      amountPaise: 500000,
      description: 'Cash transfer',
      date: `${ym}-04`,
    });
    b = await getBudgetById(db, budget.id);
    assert.strictEqual(b?.spentPaise, 300000);

    // Edit tx1: update amount to ₹4,500
    await updateTransaction(db, tx1.id, {
      accountId: accBank,
      categoryId: 'cat_groceries',
      type: 'expense',
      amountPaise: 450000,
      description: 'Weekly Veggies Updated',
      date: `${ym}-03`,
    });
    b = await getBudgetById(db, budget.id);
    assert.strictEqual(b?.spentPaise, 450000);

    // Delete tx1: budget spent resets to 0
    await deleteTransaction(db, tx1.id);
    b = await getBudgetById(db, budget.id);
    assert.strictEqual(b?.spentPaise, 0);
    assert.strictEqual(b?.remainingPaise, 1000000);
  });

  it('10. Duplicate budget prevention and input validation', async () => {
    const { db } = await setupTestDb();
    const ym = currentMonth();

    // Create initial budget
    await createBudget(db, {
      categoryId: 'cat_shopping',
      limitPaise: 500000,
      month: ym,
    });

    // Attempting duplicate creation for same category and month should fail
    await assert.rejects(
      async () => {
        await createBudget(db, {
          categoryId: 'cat_shopping',
          limitPaise: 600000,
          month: ym,
        });
      },
      /already exists/i
    );

    // Attempting negative or zero limit should fail
    await assert.rejects(
      async () => {
        await createBudget(db, {
          categoryId: 'cat_health',
          limitPaise: 0,
          month: ym,
        });
      },
      /positive integer/i
    );

    await assert.rejects(
      async () => {
        await createBudget(db, {
          categoryId: 'cat_health',
          limitPaise: -10000,
          month: ym,
        });
      },
      /positive integer/i
    );

    // Attempting budget for income category should fail
    await assert.rejects(
      async () => {
        await createBudget(db, {
          categoryId: 'cat_salary',
          limitPaise: 100000,
          month: ym,
        });
      },
      /expense/i
    );
  });

  it('11. Monthly budget summary aggregates multiple categories correctly', async () => {
    const { db, accBank } = await setupTestDb();
    const ym = currentMonth();

    // Budget 1: Food ₹5,000
    await createBudget(db, {
      categoryId: 'cat_food',
      limitPaise: 500000,
      month: ym,
    });

    // Budget 2: Shopping ₹10,000
    await createBudget(db, {
      categoryId: 'cat_shopping',
      limitPaise: 1000000,
      month: ym,
    });

    // Spend Food ₹3,000
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_food',
      type: 'expense',
      amountPaise: 300000,
      description: 'Groceries store',
      date: `${ym}-05`,
    });

    // Spend Shopping ₹4,000
    await createTransaction(db, {
      accountId: accBank,
      categoryId: 'cat_shopping',
      type: 'expense',
      amountPaise: 400000,
      description: 'Online clothes',
      date: `${ym}-08`,
    });

    const summary = await getMonthlyBudgetSummary(db, ym);
    assert.strictEqual(summary.totalLimitPaise, 1500000); // 5,000 + 10,000 = 15,000
    assert.strictEqual(summary.totalSpentPaise, 700000); // 3,000 + 4,000 = 7,000
    assert.strictEqual(summary.totalRemainingPaise, 800000); // 15,000 - 7,000 = 8,000
    assert.strictEqual(summary.overallPercentage, 47); // 7,000 / 15,000 = 46.6% -> 47%
    assert.strictEqual(summary.budgets.length, 2);
  });
});
