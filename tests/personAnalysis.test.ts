/**
 * Automated Test Suite for Person Financial Analysis — MyFlow
 * Verifies all 11 required analysis features, accounting rules,
 * chronological timeline balances, period analytics, and data consistency.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseExecutor } from '@/db/types';
import { migrateDatabase } from '@/db/schema';
import { createPerson } from '@/db/peopleRepository';
import {
  createLoan,
  createRepayment,
  deleteLoan,
  deleteRepayment,
} from '@/db/loansRepository';
import {
  getPersonFinancialAnalysis,
  getPersonTimeline,
  getPersonPeriodAnalytics,
  getPersonLoanPerformances,
} from '@/db/peopleAnalysisRepository';
import { getMonthlyIncomeExpense } from '@/db/dashboardRepository';

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

describe('MyFlow Person Financial Analysis Engine', () => {
  it('1. Person-specific totals are calculated correctly', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 200000 WHERE id = 'acc_bank';");
    await executor.runAsync("UPDATE accounts SET balance_paise = 200000 WHERE id = 'acc_cash';");

    const personA = await createPerson(executor, { name: 'Aarav' });
    const personB = await createPerson(executor, { name: 'Bhavna' });

    // Aarav: Lend ₹500 (50000 paise), Borrow ₹200 (20000 paise)
    const loanLentA = await createLoan(executor, {
      personId: personA.id,
      type: 'lent',
      principalPaise: 50000,
      accountId: 'acc_bank',
      description: 'Lent to Aarav',
      date: '2026-10-01',
    });

    const loanBorrowedA = await createLoan(executor, {
      personId: personA.id,
      type: 'borrowed',
      principalPaise: 20000,
      accountId: 'acc_bank',
      description: 'Borrowed from Aarav',
      date: '2026-10-02',
    });

    // Aarav repayments: ₹100 received on lent, ₹50 paid on borrowed
    await createRepayment(executor, {
      loanId: loanLentA.id,
      amountPaise: 10000,
      accountId: 'acc_cash',
      date: '2026-10-05',
    });

    await createRepayment(executor, {
      loanId: loanBorrowedA.id,
      amountPaise: 5000,
      accountId: 'acc_cash',
      date: '2026-10-06',
    });

    // Bhavna: Lend ₹300 (30000 paise)
    await createLoan(executor, {
      personId: personB.id,
      type: 'lent',
      principalPaise: 30000,
      accountId: 'acc_bank',
      description: 'Lent to Bhavna',
      date: '2026-10-10',
    });

    const analysisA = await getPersonFinancialAnalysis(executor, personA.id);
    assert.strictEqual(analysisA.totalLentPaise, 50000);
    assert.strictEqual(analysisA.totalBorrowedPaise, 20000);
    assert.strictEqual(analysisA.totalRepaymentsReceivedPaise, 10000);
    assert.strictEqual(analysisA.totalRepaymentsMadePaise, 5000);
    assert.strictEqual(analysisA.outstandingReceivablesPaise, 40000);
    assert.strictEqual(analysisA.outstandingPayablesPaise, 15000);
    assert.strictEqual(analysisA.netReceivablePaise, 25000, 'Net receivable = 40000 - 15000');

    // Verify Bhavna's totals are isolated
    const analysisB = await getPersonFinancialAnalysis(executor, personB.id);
    assert.strictEqual(analysisB.totalLentPaise, 30000);
    assert.strictEqual(analysisB.totalBorrowedPaise, 0);
    assert.strictEqual(analysisB.outstandingReceivablesPaise, 30000);
    assert.strictEqual(analysisB.netReceivablePaise, 30000);
  });

  it('2. Lent and borrowed amounts remain separate and do not count as ordinary income/expense', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 100000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Chirag' });

    await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 40000,
      accountId: 'acc_bank',
      description: 'Lending money',
      date: '2026-10-15',
    });

    await createLoan(executor, {
      personId: person.id,
      type: 'borrowed',
      principalPaise: 15000,
      accountId: 'acc_bank',
      description: 'Borrowing money',
      date: '2026-10-16',
    });

    const analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.totalLentPaise, 40000);
    assert.strictEqual(analysis.totalBorrowedPaise, 15000);
    assert.notStrictEqual(analysis.totalLentPaise, analysis.totalBorrowedPaise);

    // Verify monthly ordinary cashflow does NOT include loan principal
    const cashflow = await getMonthlyIncomeExpense(executor, '2026-10');
    assert.strictEqual(cashflow.incomePaise, 0, 'Loans must not count as ordinary income');
    assert.strictEqual(cashflow.expensePaise, 0, 'Loans must not count as ordinary expense');
  });

  it('3. Received and paid repayments remain separate and distinct', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 100000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Divya' });

    const lentLoan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 50000,
      accountId: 'acc_bank',
      description: 'Lent to Divya',
      date: '2026-10-01',
    });

    const borrowedLoan = await createLoan(executor, {
      personId: person.id,
      type: 'borrowed',
      principalPaise: 30000,
      accountId: 'acc_bank',
      description: 'Borrowed from Divya',
      date: '2026-10-02',
    });

    // Receive ₹200 back from Divya
    await createRepayment(executor, {
      loanId: lentLoan.id,
      amountPaise: 20000,
      accountId: 'acc_bank',
      date: '2026-10-10',
    });

    // Pay ₹100 back to Divya
    await createRepayment(executor, {
      loanId: borrowedLoan.id,
      amountPaise: 10000,
      accountId: 'acc_bank',
      date: '2026-10-11',
    });

    const analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.totalRepaymentsReceivedPaise, 20000, 'Repayments received must match lent loan repayments');
    assert.strictEqual(analysis.totalRepaymentsMadePaise, 10000, 'Repayments made must match borrowed loan repayments');
  });

  it('4. Outstanding balances match underlying loan records and integer precision', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 200000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Eshan' });

    // Lend ₹1000.50 (100050 paise)
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 100050,
      accountId: 'acc_bank',
      description: 'Loan with minor units',
      date: '2026-10-10',
    });

    // Repay ₹250.25 (25025 paise)
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 25025,
      accountId: 'acc_bank',
      date: '2026-10-15',
    });

    const expectedOutstanding = 100050 - 25025; // 75025 paise
    const analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.outstandingReceivablesPaise, expectedOutstanding);

    const performances = await getPersonLoanPerformances(executor, person.id);
    assert.strictEqual(performances[0].remainingBalancePaise, expectedOutstanding);
    assert.strictEqual(performances[0].originalPrincipalPaise, 100050);
    assert.strictEqual(performances[0].totalRepaidPaise, 25025);
  });

  it('5. Multiple loans belonging to one person are calculated independently', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 500000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Farhan' });

    // Loan 1: ₹400
    const loan1 = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 40000,
      accountId: 'acc_bank',
      description: 'First loan - bike repair',
      date: '2026-10-01',
    });

    // Loan 2: ₹600
    const loan2 = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 60000,
      accountId: 'acc_bank',
      description: 'Second loan - course fee',
      date: '2026-10-05',
    });

    // Repay partial ₹150 on Loan 1 only
    await createRepayment(executor, {
      loanId: loan1.id,
      amountPaise: 15000,
      accountId: 'acc_bank',
      date: '2026-10-10',
    });

    const performances = await getPersonLoanPerformances(executor, person.id);
    assert.strictEqual(performances.length, 2);

    const perf1 = performances.find((p) => p.loanId === loan1.id)!;
    const perf2 = performances.find((p) => p.loanId === loan2.id)!;

    assert.strictEqual(perf1.remainingBalancePaise, 25000);
    assert.strictEqual(perf1.repaymentPercentage, 38, '15000 / 40000 = 37.5% rounded to 38%');

    assert.strictEqual(perf2.remainingBalancePaise, 60000, 'Loan 2 remains untouched');
    assert.strictEqual(perf2.repaymentPercentage, 0);

    const analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.outstandingReceivablesPaise, 85000);
  });

  it('6. Settled loans remain visible in historical views and performance calculations', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 100000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Gaurav' });

    // Loan 1: ₹200
    const loan1 = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 20000,
      accountId: 'acc_bank',
      description: 'Settled loan',
      date: '2026-10-01',
    });

    // Fully repay Loan 1
    await createRepayment(executor, {
      loanId: loan1.id,
      amountPaise: 20000,
      accountId: 'acc_bank',
      date: '2026-10-10',
    });

    // Loan 2: ₹300 active
    await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 30000,
      accountId: 'acc_bank',
      description: 'Active loan',
      date: '2026-10-15',
    });

    const analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.settledLoanCount, 1);
    assert.strictEqual(analysis.activeLoanCount, 1);
    assert.strictEqual(analysis.totalLentPaise, 50000);
    assert.strictEqual(analysis.outstandingReceivablesPaise, 30000);

    const performances = await getPersonLoanPerformances(executor, person.id);
    assert.strictEqual(performances.length, 2);
    const settled = performances.find((p) => p.isClosed);
    assert.ok(settled, 'Settled loan must be present in performance list');
    assert.strictEqual(settled.repaymentPercentage, 100);
    assert.strictEqual(settled.remainingBalancePaise, 0);
  });

  it('7. Monthly totals respect the selected date range and preset', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 200000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Harish' });

    // September activity
    const septLoan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 50000,
      accountId: 'acc_bank',
      description: 'Sept loan',
      date: '2026-09-10',
    });
    await createRepayment(executor, {
      loanId: septLoan.id,
      amountPaise: 10000,
      accountId: 'acc_bank',
      date: '2026-09-20',
    });

    // October activity
    const octLoan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 30000,
      accountId: 'acc_bank',
      description: 'Oct loan',
      date: '2026-10-05',
    });
    await createRepayment(executor, {
      loanId: octLoan.id,
      amountPaise: 15000,
      accountId: 'acc_bank',
      date: '2026-10-15',
    });

    // Query October custom range
    const octAnalytics = await getPersonPeriodAnalytics(
      executor,
      person.id,
      'custom',
      '2026-10-01',
      '2026-10-31'
    );
    assert.strictEqual(octAnalytics.newLentPaise, 30000, 'Only October new lending included');
    assert.strictEqual(octAnalytics.repaymentsReceivedPaise, 15000, 'Only October repayments included');
    // Note: Point-in-time outstanding balance reflects remaining total unpaid across all active loans
    assert.strictEqual(octAnalytics.currentOutstandingReceivablesPaise, 55000, '(50000-10000) + (30000-15000) = 55000');

    // Query September custom range
    const septAnalytics = await getPersonPeriodAnalytics(
      executor,
      person.id,
      'custom',
      '2026-09-01',
      '2026-09-30'
    );
    assert.strictEqual(septAnalytics.newLentPaise, 50000, 'Only September new lending included');
    assert.strictEqual(septAnalytics.repaymentsReceivedPaise, 10000, 'Only September repayments included');
  });

  it('8. Empty periods return valid zero-valued results without errors', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    const person = await createPerson(executor, { name: 'Ishaan' });

    // Empty analytics for fresh person
    const analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.totalLentPaise, 0);
    assert.strictEqual(analysis.totalBorrowedPaise, 0);
    assert.strictEqual(analysis.totalRepaymentsReceivedPaise, 0);
    assert.strictEqual(analysis.totalRepaymentsMadePaise, 0);
    assert.strictEqual(analysis.outstandingReceivablesPaise, 0);
    assert.strictEqual(analysis.outstandingPayablesPaise, 0);
    assert.strictEqual(analysis.netReceivablePaise, 0);

    // Empty period analytics
    const period = await getPersonPeriodAnalytics(
      executor,
      person.id,
      'custom',
      '2027-01-01',
      '2027-01-31'
    );
    assert.strictEqual(period.newLentPaise, 0);
    assert.strictEqual(period.newBorrowedPaise, 0);
    assert.strictEqual(period.repaymentsReceivedPaise, 0);
    assert.strictEqual(period.repaymentsMadePaise, 0);
    assert.ok(Array.isArray(period.monthlyBreakdown));
    assert.strictEqual(period.monthlyBreakdown.length, 1);
    assert.strictEqual(period.monthlyBreakdown[0].lentPaise, 0);

    // Empty timeline
    const timeline = await getPersonTimeline(executor, person.id);
    assert.deepStrictEqual(timeline, []);
  });

  it('9. Loan and repayment events are ordered correctly with running loan balance after event', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 200000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Jaya' });

    // Loan: ₹1000 on 2026-01-10
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 100000,
      accountId: 'acc_bank',
      description: 'Annual loan',
      date: '2026-01-10',
    });

    // Repayment 1: ₹200 on 2026-02-15
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 20000,
      accountId: 'acc_bank',
      date: '2026-02-15',
    });

    // Repayment 2: ₹300 on 2026-03-20
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 30000,
      accountId: 'acc_bank',
      date: '2026-03-20',
    });

    const timeline = await getPersonTimeline(executor, person.id);
    assert.strictEqual(timeline.length, 3);

    // Timeline is newest first:
    // Event 0: Repayment 2 (2026-03-20). Remaining after: 1000 - 200 - 300 = 500 (50000 paise)
    assert.strictEqual(timeline[0].date, '2026-03-20');
    assert.strictEqual(timeline[0].type, 'repayment_received');
    assert.strictEqual(timeline[0].amountPaise, 30000);
    assert.strictEqual(timeline[0].loanOutstandingAfterPaise, 50000);

    // Event 1: Repayment 1 (2026-02-15). Remaining after: 1000 - 200 = 800 (80000 paise)
    assert.strictEqual(timeline[1].date, '2026-02-15');
    assert.strictEqual(timeline[1].type, 'repayment_received');
    assert.strictEqual(timeline[1].amountPaise, 20000);
    assert.strictEqual(timeline[1].loanOutstandingAfterPaise, 80000);

    // Event 2: Loan Inception (2026-01-10). Remaining after: 1000 (100000 paise)
    assert.strictEqual(timeline[2].date, '2026-01-10');
    assert.strictEqual(timeline[2].type, 'lent');
    assert.strictEqual(timeline[2].amountPaise, 100000);
    assert.strictEqual(timeline[2].loanOutstandingAfterPaise, 100000);

    // Test timeline filtering by type
    const repaymentsOnly = await getPersonTimeline(executor, person.id, {
      types: ['repayment_received'],
    });
    assert.strictEqual(repaymentsOnly.length, 2);
    // Running balance should still be accurate even when filtered!
    assert.strictEqual(repaymentsOnly[0].loanOutstandingAfterPaise, 50000);
    assert.strictEqual(repaymentsOnly[1].loanOutstandingAfterPaise, 80000);
  });

  it('10. Editing or deleting supported records does not produce inconsistent analysis', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 100000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Kunal' });

    // Lent ₹500
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 50000,
      accountId: 'acc_bank',
      description: 'Test loan',
      date: '2026-10-01',
    });

    // Repayment 1: ₹200
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 20000,
      accountId: 'acc_bank',
      date: '2026-10-05',
    });

    // Repayment 2: ₹300 (fully settles the loan)
    const rep2 = await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 30000,
      accountId: 'acc_bank',
      date: '2026-10-10',
    });

    let analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.settledLoanCount, 1);
    assert.strictEqual(analysis.activeLoanCount, 0);
    assert.strictEqual(analysis.outstandingReceivablesPaise, 0);

    // Now delete repayment 2
    // Repayment 2 was for 30000 paise. Deleting it must:
    // - Reopen the loan (is_closed = 0)
    // - Restore repaid_paise to 20000
    // - Recalculate outstandingReceivables to 30000
    const repayments = await executor.getAllAsync<{ id: string }>('SELECT id FROM loan_repayments WHERE amount_paise = 30000;');
    assert.strictEqual(repayments.length, 1);

    await deleteRepayment(executor, repayments[0].id);

    analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.settledLoanCount, 0, 'Loan re-opened');
    assert.strictEqual(analysis.activeLoanCount, 1);
    assert.strictEqual(analysis.totalRepaymentsReceivedPaise, 20000);
    assert.strictEqual(analysis.outstandingReceivablesPaise, 30000);

    // Now delete the loan completely
    await deleteLoan(executor, loan.id);

    analysis = await getPersonFinancialAnalysis(executor, person.id);
    assert.strictEqual(analysis.totalLentPaise, 0);
    assert.strictEqual(analysis.totalRepaymentsReceivedPaise, 0);
    assert.strictEqual(analysis.outstandingReceivablesPaise, 0);
    assert.strictEqual(analysis.activeLoanCount, 0);
  });
});
