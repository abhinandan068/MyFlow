/**
 * Dashboard repository for MyFlow.
 * Computes dashboard financial KPIs:
 * - Combined balance across accounts.
 * - Monthly income (excluding transfers).
 * - Monthly expense (excluding transfers).
 * - Individual account balances.
 * - Recent transactions.
 */
import { DashboardSummary } from '../types';
import { DatabaseExecutor } from './types';
import { getAccounts } from './accountsRepository';
import { getRecentTransactions } from './transactionsRepository';
import { currentMonth, monthRange } from '../utils/date';

export async function getMonthlyIncomeExpense(
  db: DatabaseExecutor,
  monthStr?: string
): Promise<{ incomePaise: number; expensePaise: number }> {
  const ym = monthStr || currentMonth();
  const { start, end } = monthRange(ym);

  const row = await db.getFirstAsync<{
    income_paise: number | null;
    expense_paise: number | null;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise
     FROM transactions
     WHERE date >= ? AND date <= ?;`,
    [start, end]
  );

  return {
    incomePaise: row?.income_paise ?? 0,
    expensePaise: row?.expense_paise ?? 0,
  };
}

export async function getDashboardSummary(
  db: DatabaseExecutor,
  monthStr?: string,
  recentLimit = 5
): Promise<DashboardSummary> {
  const ym = monthStr || currentMonth();
  const { incomePaise, expensePaise } = await getMonthlyIncomeExpense(db, ym);

  const totalRow = await db.getFirstAsync<{ total: number | null }>(
    'SELECT COALESCE(SUM(balance_paise), 0) as total FROM accounts;'
  );
  const totalBalancePaise = totalRow?.total ?? 0;

  const [accounts, recentTransactions, loansRow] = await Promise.all([
    getAccounts(db),
    getRecentTransactions(db, recentLimit),
    db.getFirstAsync<{
      receivables: number | null;
      payables: number | null;
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'lent' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS receivables,
        COALESCE(SUM(CASE WHEN type = 'borrowed' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS payables
      FROM loans;
    `),
  ]);

  return {
    totalBalancePaise,
    monthlyIncomePaise: incomePaise,
    monthlyExpensePaise: expensePaise,
    totalOwedToYouPaise: loansRow?.receivables ?? 0,
    totalYouOwePaise: loansRow?.payables ?? 0,
    accounts,
    recentTransactions,
  };
}
