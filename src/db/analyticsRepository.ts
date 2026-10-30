/**
 * Analytics repository for MyFlow.
 * Computes comprehensive financial analytics using real SQLite records:
 * - Income, expenses, and net cash flow
 * - Monthly income-versus-expense trends
 * - Daily spending trends
 * - Category spending breakdowns with percentage, count, and largest transaction
 * - Largest individual expenses
 * - Account balance distributions
 * - Separate outstanding receivables and payables
 * - Zero-value handling for empty periods
 * - Exclusion of transfers, lending, borrowing, and repayments from ordinary cash flow
 */
import {
  OverallAnalyticsSummary,
  AnalyticsDateRangePreset,
  IncomeExpenseTrend,
  DailySpendingTrend,
  CategorySpendingAnalysis,
  LargestExpenseItem,
  AccountBalanceBreakdown,
  TransactionWithDetails,
} from '../types';
import { DatabaseExecutor } from './types';
import {
  getDateRangeForPreset,
  getMonthsBetween,
  formatMonthShort,
  formatDate,
} from '../utils/date';
import { getAccounts } from './accountsRepository';

export async function getOverallAnalyticsSummary(
  db: DatabaseExecutor,
  preset: AnalyticsDateRangePreset,
  customStart?: string,
  customEnd?: string
): Promise<OverallAnalyticsSummary> {
  const { startDate, endDate, label } = getDateRangeForPreset(
    preset,
    customStart,
    customEnd
  );

  // 1. Period Qualifying Income and Expenses (Excludes transfers)
  const cashflowRow = await db.getFirstAsync<{
    income_paise: number | null;
    expense_paise: number | null;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise
     FROM transactions
     WHERE date >= ? AND date <= ?;`,
    [startDate, endDate]
  );

  const totalIncomePaise = cashflowRow?.income_paise ?? 0;
  const totalExpensePaise = cashflowRow?.expense_paise ?? 0;
  const netCashflowPaise = totalIncomePaise - totalExpensePaise;

  // 2. Available Cash Balance across accounts (Never adds receivables/payables)
  const accounts = await getAccounts(db);
  const totalAvailableCashPaise = accounts.reduce((acc, a) => acc + a.balancePaise, 0);

  // 3. Outstanding Receivables & Payables (Separate indicators)
  const loansRow = await db.getFirstAsync<{
    receivables: number | null;
    payables: number | null;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'lent' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS receivables,
      COALESCE(SUM(CASE WHEN type = 'borrowed' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS payables
    FROM loans;
  `);

  const outstandingReceivablesPaise = loansRow?.receivables ?? 0;
  const outstandingPayablesPaise = loansRow?.payables ?? 0;

  // 4. Monthly Income vs Expense Trends
  const months = getMonthsBetween(startDate, endDate);
  const monthlyRows = await db.getAllAsync<{
    month: string;
    income_paise: number;
    expense_paise: number;
  }>(
    `SELECT
       substr(date, 1, 7) AS month,
       COALESCE(SUM(CASE WHEN type = 'income' THEN amount_paise ELSE 0 END), 0) AS income_paise,
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END), 0) AS expense_paise
     FROM transactions
     WHERE date >= ? AND date <= ?
     GROUP BY substr(date, 1, 7);`,
    [startDate, endDate]
  );

  const monthlyMap = new Map(monthlyRows.map((m) => [m.month, m]));
  const incomeExpenseTrends: IncomeExpenseTrend[] = months.map((m) => {
    const data = monthlyMap.get(m);
    const inc = data?.income_paise ?? 0;
    const exp = data?.expense_paise ?? 0;
    return {
      month: m,
      monthLabel: formatMonthShort(m),
      incomePaise: inc,
      expensePaise: exp,
      netPaise: inc - exp,
    };
  });

  // 5. Daily Spending Trend (Qualifying expenses)
  const dailyRows = await db.getAllAsync<{
    date: string;
    amount_paise: number;
  }>(
    `SELECT
       date,
       SUM(amount_paise) AS amount_paise
     FROM transactions
     WHERE type = 'expense'
       AND date >= ? AND date <= ?
     GROUP BY date
     ORDER BY date ASC;`,
    [startDate, endDate]
  );

  const dailySpendingTrends: DailySpendingTrend[] = dailyRows.map((d) => ({
    date: d.date,
    dateLabel: formatDate(d.date).replace(/ \d{4}$/, ''),
    amountPaise: d.amount_paise,
  }));

  // 6. Category-wise Spending Breakdown
  const categoryRows = await db.getAllAsync<{
    category_id: string | null;
    category_name: string | null;
    category_icon: string | null;
    category_color: string | null;
    total_spent: number;
    tx_count: number;
    max_amount: number;
  }>(
    `SELECT
       t.category_id,
       COALESCE(c.name, 'Uncategorized') AS category_name,
       COALESCE(c.icon, 'tag') AS category_icon,
       COALESCE(c.color, '#A1A1AA') AS category_color,
       SUM(t.amount_paise) AS total_spent,
       COUNT(*) AS tx_count,
       MAX(t.amount_paise) AS max_amount
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.type = 'expense'
       AND t.date >= ? AND t.date <= ?
     GROUP BY t.category_id
     ORDER BY total_spent DESC;`,
    [startDate, endDate]
  );

  // Fetch description of largest transaction per category
  const categoryBreakdown: CategorySpendingAnalysis[] = [];
  for (const r of categoryRows) {
    let largestDesc = 'Expense';
    if (r.max_amount > 0) {
      const topTx = await db.getFirstAsync<{ description: string }>(
        `SELECT description FROM transactions
         WHERE type = 'expense'
           AND (category_id = ? OR (? IS NULL AND category_id IS NULL))
           AND date >= ? AND date <= ?
         ORDER BY amount_paise DESC, date DESC LIMIT 1;`,
        [r.category_id, r.category_id, startDate, endDate]
      );
      if (topTx?.description) largestDesc = topTx.description;
    }

    const percentage =
      totalExpensePaise > 0
        ? Math.round((r.total_spent / totalExpensePaise) * 100)
        : 0;

    categoryBreakdown.push({
      categoryId: r.category_id ?? 'uncategorized',
      categoryName: r.category_name ?? 'Uncategorized',
      categoryIcon: r.category_icon ?? 'tag',
      categoryColor: r.category_color ?? '#A1A1AA',
      totalSpentPaise: r.total_spent,
      percentageOfTotal: percentage,
      transactionCount: r.tx_count,
      largestTransactionPaise: r.max_amount,
      largestTransactionDescription: largestDesc,
    });
  }

  // 7. Largest Individual Expenses in period
  const largestExpenseRows = await db.getAllAsync<{
    id: string;
    amount_paise: number;
    description: string;
    date: string;
    category_id: string | null;
    category_name: string | null;
    category_icon: string | null;
    category_color: string | null;
    account_name: string | null;
  }>(
    `SELECT
       t.id, t.amount_paise, t.description, t.date, t.category_id,
       COALESCE(c.name, 'Uncategorized') AS category_name,
       COALESCE(c.icon, 'tag') AS category_icon,
       COALESCE(c.color, '#A1A1AA') AS category_color,
       COALESCE(a.name, 'Account') AS account_name
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.type = 'expense'
       AND t.date >= ? AND t.date <= ?
     ORDER BY t.amount_paise DESC, t.date DESC
     LIMIT 10;`,
    [startDate, endDate]
  );

  const largestExpenses: LargestExpenseItem[] = largestExpenseRows.map((e) => ({
    id: e.id,
    amountPaise: e.amount_paise,
    description: e.description || 'Expense',
    date: e.date,
    categoryId: e.category_id,
    categoryName: e.category_name ?? 'Uncategorized',
    categoryIcon: e.category_icon ?? 'tag',
    categoryColor: e.category_color ?? '#A1A1AA',
    accountName: e.account_name ?? 'Account',
  }));

  // 8. Account Balance Breakdown
  const accountBalances: AccountBalanceBreakdown[] = accounts.map((a) => ({
    accountId: a.id,
    accountName: a.name,
    accountType: a.type,
    balancePaise: a.balancePaise,
    color: a.color,
    icon: a.icon,
    percentageOfTotal:
      totalAvailableCashPaise > 0
        ? Math.round((Math.max(0, a.balancePaise) / totalAvailableCashPaise) * 100)
        : 0,
  }));

  return {
    preset,
    startDate,
    endDate,
    periodLabel: label,
    totalIncomePaise,
    totalExpensePaise,
    netCashflowPaise,
    incomeExpenseTrends,
    dailySpendingTrends,
    categoryBreakdown,
    largestExpenses,
    accountBalances,
    totalAvailableCashPaise,
    outstandingReceivablesPaise,
    outstandingPayablesPaise,
  };
}

export async function getCategoryPeriodTransactions(
  db: DatabaseExecutor,
  categoryId: string,
  startDate: string,
  endDate: string
): Promise<TransactionWithDetails[]> {
  const isUncategorized = categoryId === 'uncategorized';
  const query = `
    SELECT
      t.id, t.type, t.amount_paise, t.account_id, t.to_account_id,
      t.category_id, t.description, t.note, t.date, t.created_at, t.updated_at,
      a.name AS account_name, a.color AS account_color, a.icon AS account_icon,
      c.name AS category_name, c.icon AS category_icon, c.color AS category_color
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.type = 'expense'
      AND ${isUncategorized ? '(t.category_id IS NULL OR t.category_id = ?)' : 't.category_id = ?'}
      AND t.date >= ? AND t.date <= ?
    ORDER BY t.date DESC, t.created_at DESC;
  `;

  const rows = await db.getAllAsync<any>(query, [categoryId, startDate, endDate]);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    amountPaise: r.amount_paise,
    accountId: r.account_id,
    toAccountId: r.to_account_id,
    categoryId: r.category_id,
    description: r.description,
    note: r.note,
    date: r.date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    accountName: r.account_name ?? 'Account',
    accountColor: r.account_color ?? '#B5A0FF',
    accountIcon: r.account_icon ?? 'wallet',
    categoryName: r.category_name ?? 'Uncategorized',
    categoryIcon: r.category_icon ?? 'tag',
    categoryColor: r.category_color ?? '#A1A1AA',
  }));
}
