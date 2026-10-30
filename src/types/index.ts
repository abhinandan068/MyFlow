// ─── Core Domain Types ───────────────────────────────────────────────────────
// All monetary amounts are stored as integer minor units (paise for INR).
// e.g., ₹100.50 is stored as 10050.

export type CurrencyCode = 'INR';

export type TransactionType = 'income' | 'expense' | 'transfer';

export type AccountType = 'bank' | 'upi' | 'cash' | 'credit' | 'other';

export type LoanType = 'lent' | 'borrowed';

// ─── Account ─────────────────────────────────────────────────────────────────

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Balance in minor units (paise) */
  balancePaise: number;
  color: string;
  icon: string;
  isDefault: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// ─── Category ────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense' | 'both';
  isSystem: boolean;
  createdAt: string;
}

// ─── Transaction ─────────────────────────────────────────────────────────────

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Amount in minor units (paise) */
  amountPaise: number;
  accountId: string;
  /** Only for transfers: destination account */
  toAccountId?: string | null;
  categoryId?: string | null;
  description: string;
  note?: string | null;
  date: string; // ISO 8601 date string (YYYY-MM-DD)
  createdAt: string;
  updatedAt: string;
}

export interface TransactionWithDetails extends Transaction {
  accountName: string;
  accountColor: string;
  accountIcon: string;
  toAccountName?: string | null;
  categoryName?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
}

export interface CreateTransactionInput {
  id?: string;
  type: TransactionType;
  amountPaise: number;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  description: string;
  note?: string | null;
  date: string;
}

export interface TransactionFilter {
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface DashboardSummary {
  totalBalancePaise: number;
  monthlyIncomePaise: number;
  monthlyExpensePaise: number;
  totalOwedToYouPaise: number;
  totalYouOwePaise: number;
  accounts: Account[];
  recentTransactions: TransactionWithDetails[];
}

// ─── Person (for lending/borrowing) ──────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  avatarColor: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PersonWithTotals extends Person {
  totalLentPaise: number;
  totalLentOutstandingPaise: number;
  totalBorrowedPaise: number;
  totalBorrowedOutstandingPaise: number;
  activeLoanCount: number;
  settledLoanCount: number;
}

// ─── Loan / Debt ─────────────────────────────────────────────────────────────

export interface Loan {
  id: string;
  personId: string;
  type: LoanType;
  /** Original principal in paise */
  principalPaise: number;
  /** Amount already repaid in paise */
  repaidPaise: number;
  accountId: string;
  description: string;
  date: string; // YYYY-MM-DD
  dueDate?: string | null;
  note?: string | null;
  isClosed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoanWithDetails extends Loan {
  personName: string;
  personPhone?: string | null;
  personAvatarColor: string;
  accountName: string;
  accountColor: string;
  accountIcon: string;
  outstandingPaise: number;
}

export interface CreateLoanInput {
  id?: string;
  personId: string;
  type: LoanType;
  principalPaise: number;
  accountId: string;
  description: string;
  date: string;
  dueDate?: string | null;
  note?: string | null;
}

export interface CreateRepaymentInput {
  id?: string;
  loanId: string;
  amountPaise: number;
  accountId: string;
  date: string;
  note?: string | null;
}

export interface LoanRepayment {
  id: string;
  loanId: string;
  /** Repayment amount in paise */
  amountPaise: number;
  accountId: string;
  note?: string | null;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export interface LoanRepaymentWithDetails extends LoanRepayment {
  accountName: string;
  accountColor: string;
  accountIcon: string;
}

export interface LendingSummary {
  totalReceivablesPaise: number;
  totalPayablesPaise: number;
  activeLentCount: number;
  activeBorrowedCount: number;
}

// ─── Budget ──────────────────────────────────────────────────────────────────

export interface Budget {
  id: string;
  categoryId: string;
  /** Budget limit in paise */
  limitPaise: number;
  /** Month key: YYYY-MM */
  month: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetWithDetails extends Budget {
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  /** Actual qualifying expenses in minor units (paise) */
  spentPaise: number;
  /** Remaining budget in minor units (paise), can be negative if exceeded */
  remainingPaise: number;
  /** Percentage of limit used, can exceed 100 */
  percentageUsed: number;
  isExceeded: boolean;
  isApproaching: boolean;
  transactionCount: number;
}

export interface CreateBudgetInput {
  id?: string;
  categoryId: string;
  limitPaise: number;
  month: string; // YYYY-MM
}

export interface UpdateBudgetInput {
  limitPaise?: number;
  categoryId?: string;
  month?: string;
}

export interface MonthlyBudgetSummary {
  month: string; // YYYY-MM
  totalLimitPaise: number;
  totalSpentPaise: number;
  totalRemainingPaise: number;
  overallPercentage: number;
  budgets: BudgetWithDetails[];
}


// ─── Settings ────────────────────────────────────────────────────────────────

export interface AppSettings {
  currency: CurrencyCode;
  defaultAccountId?: string;
  notificationsEnabled: boolean;
  reminderTime: string; // HH:MM in 24h format
  backupPath?: string;
  lastBackupAt?: string;
}

// ─── Computed / Derived ──────────────────────────────────────────────────────

export interface MonthSummary {
  month: string; // YYYY-MM
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
}

export interface CategorySummary {
  categoryId: string;
  categoryName: string;
  color: string;
  icon: string;
  totalPaise: number;
  percentage: number;
}

export interface AccountWithBalance extends Account {
  /** Computed from transactions */
  computedBalancePaise: number;
}

// ─── UI Form Types ────────────────────────────────────────────────────────────

export interface TransactionFormData {
  type: TransactionType;
  amountStr: string;
  description: string;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  note: string;
  date: string;
}

// ─── Person Financial Analysis & Timeline ─────────────────────────────────────

export type PersonTimelineEventType =
  | 'lent'
  | 'borrowed'
  | 'repayment_received'
  | 'repayment_made';

export type PersonTimelineFilterType = 'all' | PersonTimelineEventType;

export interface PersonTimelineEvent {
  id: string;
  loanId: string;
  type: PersonTimelineEventType;
  amountPaise: number;
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO 8601 for tie-breaking
  loanDescription: string;
  accountId: string;
  accountName: string;
  accountColor?: string;
  notes?: string | null;
  /**
   * Outstanding balance of this specific loan immediately following this event,
   * computed using reliable chronological ordering.
   */
  loanOutstandingAfterPaise: number;
}

export interface PersonTimelineFilter {
  types?: PersonTimelineEventType[];
  startDate?: string;
  endDate?: string;
}

export interface PersonFinancialAnalysis {
  personId: string;
  /** Historical total amount lent to this person */
  totalLentPaise: number;
  /** Historical total amount borrowed from this person */
  totalBorrowedPaise: number;
  /** Total repayments received from this person */
  totalRepaymentsReceivedPaise: number;
  /** Total repayments made to this person */
  totalRepaymentsMadePaise: number;
  /** Current outstanding balance owed by this person to user */
  outstandingReceivablesPaise: number;
  /** Current outstanding balance owed by user to this person */
  outstandingPayablesPaise: number;
  /**
   * Net receivable: outstandingReceivablesPaise - outstandingPayablesPaise.
   * Positive means person net owes user. Negative means user net owes person.
   */
  netReceivablePaise: number;
  activeLoanCount: number;
  settledLoanCount: number;
}

export type DateRangePreset =
  | '30d'
  | 'this_month'
  | 'last_month'
  | '6m'
  | '12m'
  | 'custom';

export interface PersonMonthlyBreakdown {
  month: string; // YYYY-MM
  monthLabel: string; // e.g. "Oct '26"
  lentPaise: number;
  borrowedPaise: number;
  repaymentsReceivedPaise: number;
  repaymentsMadePaise: number;
}

export interface PersonPeriodAnalytics {
  personId: string;
  preset: DateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  periodLabel: string;
  /** Activity within selected period */
  newLentPaise: number;
  newBorrowedPaise: number;
  repaymentsReceivedPaise: number;
  repaymentsMadePaise: number;
  /** Current point-in-time outstanding balances */
  currentOutstandingReceivablesPaise: number;
  currentOutstandingPayablesPaise: number;
  currentNetReceivablePaise: number;
  /** Monthly trend breakdown within the period */
  monthlyBreakdown: PersonMonthlyBreakdown[];
}

export interface LoanPerformance {
  loanId: string;
  personId: string;
  type: LoanType;
  description: string;
  originalPrincipalPaise: number;
  totalRepaidPaise: number;
  remainingBalancePaise: number;
  repaymentPercentage: number;
  loanDate: string;
  dueDate?: string | null;
  isClosed: boolean;
  accountName: string;
  repaymentsCount: number;
  repayments: LoanRepaymentWithDetails[];
}

// ─── Overall Financial Analytics ──────────────────────────────────────────────

export type AnalyticsDateRangePreset =
  | 'this_month'
  | 'last_month'
  | '6m'
  | '12m'
  | 'custom';

export interface IncomeExpenseTrend {
  month: string; // YYYY-MM
  monthLabel: string; // e.g. "Oct '26"
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
}

export interface DailySpendingTrend {
  date: string; // YYYY-MM-DD
  dateLabel: string; // e.g. "28 Oct"
  amountPaise: number;
}

export interface CategorySpendingAnalysis {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  totalSpentPaise: number;
  percentageOfTotal: number;
  transactionCount: number;
  largestTransactionPaise: number;
  largestTransactionDescription: string;
}

export interface LargestExpenseItem {
  id: string;
  amountPaise: number;
  description: string;
  date: string;
  categoryId?: string | null;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  accountName: string;
}

export interface AccountBalanceBreakdown {
  accountId: string;
  accountName: string;
  accountType: string;
  balancePaise: number;
  color: string;
  icon: string;
  percentageOfTotal: number;
}

export interface OverallAnalyticsSummary {
  preset: AnalyticsDateRangePreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  periodLabel: string;
  totalIncomePaise: number;
  totalExpensePaise: number;
  netCashflowPaise: number;
  incomeExpenseTrends: IncomeExpenseTrend[];
  dailySpendingTrends: DailySpendingTrend[];
  categoryBreakdown: CategorySpendingAnalysis[];
  largestExpenses: LargestExpenseItem[];
  accountBalances: AccountBalanceBreakdown[];
  totalAvailableCashPaise: number;
  outstandingReceivablesPaise: number;
  outstandingPayablesPaise: number;
}
