/**
 * Automated test suite for People, Lending, Borrowing, and Repayments.
 * Verifies all financial integrity and accounting rules for loans and repayments.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { DatabaseExecutor } from '@/db/types';
import { migrateDatabase } from '@/db/schema';
import { getAccountById, getTotalBalancePaise } from '@/db/accountsRepository';
import {
  createPerson,
  getPeople,
  getPersonById,
  updatePerson,
  deletePerson,
} from '@/db/peopleRepository';
import {
  createLoan,
  createRepayment,
  getLoans,
  getLoanById,
  getRepaymentsForLoan,
  getLendingSummary,
  deleteLoan,
} from '@/db/loansRepository';
import { getMonthlyIncomeExpense, getDashboardSummary } from '@/db/dashboardRepository';

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

describe('MyFlow People, Lending, Borrowing & Repayment Engine', () => {
  it('1. Create and manage a person', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    const person = await createPerson(executor, {
      name: 'Rahul Sharma',
      phone: '+919876543210',
      notes: 'Colleague at work',
    });

    assert.strictEqual(person.name, 'Rahul Sharma');
    assert.strictEqual(person.phone, '+919876543210');

    // Update person
    await updatePerson(executor, person.id, {
      phone: '+919999988888',
      notes: 'Updated colleague info',
    });

    const updated = await getPersonById(executor, person.id);
    assert.strictEqual(updated?.phone, '+919999988888');
    assert.strictEqual(updated?.notes, 'Updated colleague info');
  });

  it('2. Lending money decreases account balance and increases receivable', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Initial Bank = 50000 paise (₹500)
    await executor.runAsync("UPDATE accounts SET balance_paise = 50000 WHERE id = 'acc_bank';");

    const person = await createPerson(executor, { name: 'Priya' });

    // Lend ₹200 (20000 paise) to Priya from Bank
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 20000,
      accountId: 'acc_bank',
      description: 'Emergency loan for travel',
      date: '2026-10-28',
      dueDate: '2026-11-15',
    });

    // Check account balance: was 50000, now 30000
    const bank = await getAccountById(executor, 'acc_bank');
    assert.strictEqual(bank?.balancePaise, 30000, 'Lending must deduct funds from account');

    // Check loan details
    assert.strictEqual(loan.outstandingPaise, 20000);
    assert.strictEqual(loan.isClosed, false);

    // Check person totals
    const personWithTotals = await getPersonById(executor, person.id);
    assert.strictEqual(personWithTotals?.totalLentOutstandingPaise, 20000);

    // Check lending summary
    const summary = await getLendingSummary(executor);
    assert.strictEqual(summary.totalReceivablesPaise, 20000);
    assert.strictEqual(summary.totalPayablesPaise, 0);

    // Verify lending does NOT affect monthly income or expense totals
    const cashflow = await getMonthlyIncomeExpense(executor, '2026-10');
    assert.strictEqual(cashflow.incomePaise, 0, 'Lending must not count as income');
    assert.strictEqual(cashflow.expensePaise, 0, 'Lending must not count as expense');
  });

  it('3. Borrowing money increases account balance and increases payable', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Initial Cash = 10000 paise (₹100)
    await executor.runAsync("UPDATE accounts SET balance_paise = 10000 WHERE id = 'acc_cash';");

    const person = await createPerson(executor, { name: 'Amit' });

    // Borrow ₹300 (30000 paise) from Amit into Cash
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'borrowed',
      principalPaise: 30000,
      accountId: 'acc_cash',
      description: 'Borrowed for rent deposit',
      date: '2026-10-28',
    });

    // Check account balance: was 10000, now 40000
    const cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 40000, 'Borrowing must add funds to account');

    // Check loan details
    assert.strictEqual(loan.outstandingPaise, 30000);
    assert.strictEqual(loan.isClosed, false);

    // Check person totals
    const personWithTotals = await getPersonById(executor, person.id);
    assert.strictEqual(personWithTotals?.totalBorrowedOutstandingPaise, 30000);

    // Check lending summary
    const summary = await getLendingSummary(executor);
    assert.strictEqual(summary.totalPayablesPaise, 30000);

    // Verify borrowing does NOT affect monthly income or expense totals
    const cashflow = await getMonthlyIncomeExpense(executor, '2026-10');
    assert.strictEqual(cashflow.incomePaise, 0, 'Borrowing must not count as income');
    assert.strictEqual(cashflow.expensePaise, 0, 'Borrowing must not count as expense');
  });

  it('4. Partial repayment of lent money increases account balance and reduces outstanding balance', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 100000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Vikram' });

    // Lend ₹500 (50000 paise)
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 50000,
      accountId: 'acc_bank',
      description: 'Lent for laptop repair',
      date: '2026-10-20',
    });

    let bank = await getAccountById(executor, 'acc_bank');
    assert.strictEqual(bank?.balancePaise, 50000);

    // Vikram repays partial amount ₹200 (20000 paise) into Cash
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 20000,
      accountId: 'acc_cash',
      date: '2026-10-25',
      note: 'First installment via cash',
    });

    // Cash was 0, now 20000
    const cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 20000, 'Repayment received must credit destination account');

    // Loan outstanding: 50000 - 20000 = 30000
    const updatedLoan = await getLoanById(executor, loan.id);
    assert.strictEqual(updatedLoan?.repaidPaise, 20000);
    assert.strictEqual(updatedLoan?.outstandingPaise, 30000);
    assert.strictEqual(updatedLoan?.isClosed, false, 'Loan remains active while outstanding > 0');

    // Repayments history has 1 record
    const repayments = await getRepaymentsForLoan(executor, loan.id);
    assert.strictEqual(repayments.length, 1);
    assert.strictEqual(repayments[0].amountPaise, 20000);
    assert.strictEqual(repayments[0].accountName, 'Cash');
  });

  it('5. Over-repayment is rejected and leaves data unchanged', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    const person = await createPerson(executor, { name: 'Sneha' });
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 10000, // ₹100
      accountId: 'acc_cash',
      description: 'Small loan',
      date: '2026-10-28',
    });

    // Attempt to repay ₹150 (15000 paise) when only ₹100 is owed
    await assert.rejects(
      async () => {
        await createRepayment(executor, {
          loanId: loan.id,
          amountPaise: 15000,
          accountId: 'acc_cash',
          date: '2026-10-28',
        });
      },
      /exceeds the outstanding balance/,
      'Must reject repayment greater than outstanding amount'
    );

    // Verify loan is untouched
    const untouchedLoan = await getLoanById(executor, loan.id);
    assert.strictEqual(untouchedLoan?.repaidPaise, 0);
  });

  it('6. Full repayment marks the loan as settled', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    const person = await createPerson(executor, { name: 'Karan' });
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 10000,
      accountId: 'acc_cash',
      description: 'Concert ticket',
      date: '2026-10-28',
    });

    // Repay full amount 10000 paise
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 10000,
      accountId: 'acc_bank',
      date: '2026-10-28',
    });

    const settledLoan = await getLoanById(executor, loan.id);
    assert.strictEqual(settledLoan?.outstandingPaise, 0);
    assert.strictEqual(settledLoan?.isClosed, true, 'Fully repaid loan must be marked as settled (isClosed = true)');

    // Attempting another repayment on settled loan should be rejected
    await assert.rejects(
      async () => {
        await createRepayment(executor, {
          loanId: loan.id,
          amountPaise: 1000,
          accountId: 'acc_bank',
          date: '2026-10-28',
        });
      },
      /already fully settled/,
      'Cannot repay an already settled loan'
    );
  });

  it('7. Repayment of borrowed money decreases account balance and reduces payable', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 50000 WHERE id = 'acc_bank';");
    const person = await createPerson(executor, { name: 'Rohan' });

    // Borrow ₹200 (20000 paise)
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'borrowed',
      principalPaise: 20000,
      accountId: 'acc_bank',
      description: 'Borrowed for electricity bill',
      date: '2026-10-20',
    });

    // Bank had 50000 + 20000 = 70000
    let bank = await getAccountById(executor, 'acc_bank');
    assert.strictEqual(bank?.balancePaise, 70000);

    // Pay back Rohan ₹150 (15000 paise) from Bank
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 15000,
      accountId: 'acc_bank',
      date: '2026-10-28',
      note: 'Part payment',
    });

    // Bank should be 70000 - 15000 = 55000
    bank = await getAccountById(executor, 'acc_bank');
    assert.strictEqual(bank?.balancePaise, 55000, 'Repaying borrowed money must deduct funds from account');

    const updatedLoan = await getLoanById(executor, loan.id);
    assert.strictEqual(updatedLoan?.outstandingPaise, 5000);
    assert.strictEqual(updatedLoan?.isClosed, false);
  });

  it('8. Dashboard live KPIs include Owed to You and You Owe without altering available cash', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    // Seed cash = 10000 paise (₹100)
    await executor.runAsync("UPDATE accounts SET balance_paise = 10000 WHERE id = 'acc_cash';");
    const person = await createPerson(executor, { name: 'Maya' });

    // Lend ₹40 (4000 paise) -> Cash becomes 6000
    await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 4000,
      accountId: 'acc_cash',
      description: 'Lent to Maya',
      date: '2026-10-28',
    });

    // Borrow ₹25 (2500 paise) -> Cash becomes 8500
    await createLoan(executor, {
      personId: person.id,
      type: 'borrowed',
      principalPaise: 2500,
      accountId: 'acc_cash',
      description: 'Borrowed from Maya',
      date: '2026-10-28',
    });

    const summary = await getDashboardSummary(executor, '2026-10');

    assert.strictEqual(summary.totalBalancePaise, 8500, 'Available cash is purely the account balances');
    assert.strictEqual(summary.totalOwedToYouPaise, 4000, 'Receivables live total');
    assert.strictEqual(summary.totalYouOwePaise, 2500, 'Payables live total');
  });

  it('9. Deleting a loan reverses its financial effects and clears repayments safely', async () => {
    const { executor } = createInMemoryExecutor();
    await migrateDatabase(executor);

    await executor.runAsync("UPDATE accounts SET balance_paise = 50000 WHERE id = 'acc_cash';");
    const person = await createPerson(executor, { name: 'Deepak' });

    // Lend 20000 -> Cash becomes 30000
    const loan = await createLoan(executor, {
      personId: person.id,
      type: 'lent',
      principalPaise: 20000,
      accountId: 'acc_cash',
      description: 'Test loan',
      date: '2026-10-28',
    });

    // Repay 5000 -> Cash becomes 35000
    await createRepayment(executor, {
      loanId: loan.id,
      amountPaise: 5000,
      accountId: 'acc_cash',
      date: '2026-10-28',
    });

    let cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 35000);

    // Delete loan: should reverse 20000 principal (add back 20000) and reverse 5000 repayment (subtract 5000) -> Cash back to 50000!
    await deleteLoan(executor, loan.id);

    cash = await getAccountById(executor, 'acc_cash');
    assert.strictEqual(cash?.balancePaise, 50000, 'Deleting loan must fully restore original balance');

    const deletedLoan = await getLoanById(executor, loan.id);
    assert.strictEqual(deletedLoan, null);
    const repayments = await getRepaymentsForLoan(executor, loan.id);
    assert.strictEqual(repayments.length, 0);
  });
});
