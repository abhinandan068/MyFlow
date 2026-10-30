/**
 * Person Financial Analysis Repository for MyFlow.
 * Handles person-specific analytics, chronological event timelines,
 * period-based aggregates, monthly trends, and loan performance.
 */
import {
  PersonFinancialAnalysis,
  PersonTimelineEvent,
  PersonTimelineFilter,
  PersonPeriodAnalytics,
  PersonMonthlyBreakdown,
  LoanPerformance,
  DateRangePreset,
  LoanType,
} from '../types';
import { DatabaseExecutor } from './types';
import {
  getDateRangeForPreset,
  getMonthsBetween,
  formatMonthShort,
} from '../utils/date';
import { getLoans, getRepaymentsForLoan } from './loansRepository';

/**
 * 1. Calculate comprehensive person-specific financial totals:
 * - Total Lent & Total Borrowed
 * - Total Repayments Received & Total Repayments Made
 * - Outstanding Receivables & Outstanding Payables
 * - Net Receivable (Receivables - Payables)
 */
export async function getPersonFinancialAnalysis(
  db: DatabaseExecutor,
  personId: string
): Promise<PersonFinancialAnalysis> {
  // Aggregate loan principals and counts
  const loanStats = await db.getFirstAsync<{
    total_lent: number | null;
    total_borrowed: number | null;
    active_count: number | null;
    settled_count: number | null;
    outstanding_receivables: number | null;
    outstanding_payables: number | null;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'lent' THEN principal_paise ELSE 0 END), 0) AS total_lent,
       COALESCE(SUM(CASE WHEN type = 'borrowed' THEN principal_paise ELSE 0 END), 0) AS total_borrowed,
       COALESCE(COUNT(CASE WHEN is_closed = 0 THEN 1 END), 0) AS active_count,
       COALESCE(COUNT(CASE WHEN is_closed = 1 THEN 1 END), 0) AS settled_count,
       COALESCE(SUM(CASE WHEN type = 'lent' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS outstanding_receivables,
       COALESCE(SUM(CASE WHEN type = 'borrowed' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS outstanding_payables
     FROM loans
     WHERE person_id = ?;`,
    [personId]
  );

  // Aggregate repayments received (on loans user lent to this person)
  const receivedRow = await db.getFirstAsync<{ total_received: number | null }>(
    `SELECT COALESCE(SUM(r.amount_paise), 0) AS total_received
     FROM loan_repayments r
     JOIN loans l ON r.loan_id = l.id
     WHERE l.person_id = ? AND l.type = 'lent';`,
    [personId]
  );

  // Aggregate repayments made (on loans user borrowed from this person)
  const madeRow = await db.getFirstAsync<{ total_made: number | null }>(
    `SELECT COALESCE(SUM(r.amount_paise), 0) AS total_made
     FROM loan_repayments r
     JOIN loans l ON r.loan_id = l.id
     WHERE l.person_id = ? AND l.type = 'borrowed';`,
    [personId]
  );

  const totalLentPaise = loanStats?.total_lent ?? 0;
  const totalBorrowedPaise = loanStats?.total_borrowed ?? 0;
  const totalRepaymentsReceivedPaise = receivedRow?.total_received ?? 0;
  const totalRepaymentsMadePaise = madeRow?.total_made ?? 0;
  const outstandingReceivablesPaise = loanStats?.outstanding_receivables ?? 0;
  const outstandingPayablesPaise = loanStats?.outstanding_payables ?? 0;
  const netReceivablePaise = outstandingReceivablesPaise - outstandingPayablesPaise;

  return {
    personId,
    totalLentPaise,
    totalBorrowedPaise,
    totalRepaymentsReceivedPaise,
    totalRepaymentsMadePaise,
    outstandingReceivablesPaise,
    outstandingPayablesPaise,
    netReceivablePaise,
    activeLoanCount: loanStats?.active_count ?? 0,
    settledLoanCount: loanStats?.settled_count ?? 0,
  };
}

/**
 * 2. Complete person-specific financial history / chronological timeline.
 * Returns all loan inceptions and repayments ordered chronologically.
 * Calculates `loanOutstandingAfterPaise` per loan reliably.
 */
export async function getPersonTimeline(
  db: DatabaseExecutor,
  personId: string,
  filter?: PersonTimelineFilter
): Promise<PersonTimelineEvent[]> {
  // Query all loans for this person
  const loanRows = await db.getAllAsync<{
    id: string;
    type: LoanType;
    principal_paise: number;
    description: string;
    note: string | null;
    date: string;
    created_at: string;
    account_id: string;
    account_name: string | null;
    account_color: string | null;
  }>(
    `SELECT
       l.id, l.type, l.principal_paise, l.description, l.note, l.date, l.created_at,
       l.account_id, a.name AS account_name, a.color AS account_color
     FROM loans l
     LEFT JOIN accounts a ON l.account_id = a.id
     WHERE l.person_id = ?;`,
    [personId]
  );

  // Query all repayments for this person's loans
  const repaymentRows = await db.getAllAsync<{
    id: string;
    loan_id: string;
    amount_paise: number;
    note: string | null;
    date: string;
    created_at: string;
    account_id: string;
    account_name: string | null;
    account_color: string | null;
    loan_type: LoanType;
    loan_description: string;
  }>(
    `SELECT
       r.id, r.loan_id, r.amount_paise, r.note, r.date, r.created_at,
       r.account_id, a.name AS account_name, a.color AS account_color,
       l.type AS loan_type, l.description AS loan_description
     FROM loan_repayments r
     JOIN loans l ON r.loan_id = l.id
     LEFT JOIN accounts a ON r.account_id = a.id
     WHERE l.person_id = ?;`,
    [personId]
  );

  // Build raw list of events
  type InternalEvent = PersonTimelineEvent & { isLoanInception: boolean };
  const rawEvents: InternalEvent[] = [];

  for (const l of loanRows) {
    rawEvents.push({
      id: l.id,
      loanId: l.id,
      type: l.type, // 'lent' | 'borrowed'
      amountPaise: l.principal_paise,
      date: l.date,
      createdAt: l.created_at,
      loanDescription: l.description || (l.type === 'lent' ? 'Money Lent' : 'Money Borrowed'),
      accountId: l.account_id,
      accountName: l.account_name ?? 'Account',
      accountColor: l.account_color ?? '#B5A0FF',
      notes: l.note,
      loanOutstandingAfterPaise: 0, // Computed below in chronological pass
      isLoanInception: true,
    });
  }

  for (const r of repaymentRows) {
    rawEvents.push({
      id: r.id,
      loanId: r.loan_id,
      type: r.loan_type === 'lent' ? 'repayment_received' : 'repayment_made',
      amountPaise: r.amount_paise,
      date: r.date,
      createdAt: r.created_at,
      loanDescription: r.loan_description || 'Loan Repayment',
      accountId: r.account_id,
      accountName: r.account_name ?? 'Account',
      accountColor: r.account_color ?? '#B5A0FF',
      notes: r.note,
      loanOutstandingAfterPaise: 0, // Computed below in chronological pass
      isLoanInception: false,
    });
  }

  // Sort ascending for chronological tracking pass
  // Order: date ASC, then loan inception before repayment if same date/time, then createdAt ASC
  rawEvents.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    // If loan inception and repayment on same date, loan inception comes first
    if (a.isLoanInception !== b.isLoanInception) {
      return a.isLoanInception ? -1 : 1;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });

  // Track each loan's principal and cumulative repayments to compute exact balance after each event
  const loanPrincipalMap = new Map<string, number>();
  const loanCumulativeRepaidMap = new Map<string, number>();

  for (const ev of rawEvents) {
    if (ev.isLoanInception) {
      loanPrincipalMap.set(ev.loanId, ev.amountPaise);
      loanCumulativeRepaidMap.set(ev.loanId, 0);
      ev.loanOutstandingAfterPaise = ev.amountPaise;
    } else {
      const currentRepaid = (loanCumulativeRepaidMap.get(ev.loanId) ?? 0) + ev.amountPaise;
      loanCumulativeRepaidMap.set(ev.loanId, currentRepaid);
      const principal = loanPrincipalMap.get(ev.loanId) ?? ev.amountPaise;
      ev.loanOutstandingAfterPaise = Math.max(0, principal - currentRepaid);
    }
  }

  // Apply filters after reliable chronological calculation
  let filtered = rawEvents.map(({ isLoanInception, ...rest }) => rest);

  if (filter?.types && filter.types.length > 0) {
    const allowed = new Set(filter.types);
    filtered = filtered.filter((ev) => allowed.has(ev.type));
  }

  if (filter?.startDate) {
    filtered = filtered.filter((ev) => ev.date >= filter.startDate!);
  }

  if (filter?.endDate) {
    filtered = filtered.filter((ev) => ev.date <= filter.endDate!);
  }

  // Present newest first for natural user timeline
  filtered.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  return filtered;
}

/**
 * 3. Period-based financial analytics & monthly trend breakdown.
 */
export async function getPersonPeriodAnalytics(
  db: DatabaseExecutor,
  personId: string,
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): Promise<PersonPeriodAnalytics> {
  const { startDate, endDate, label } = getDateRangeForPreset(
    preset,
    customStart,
    customEnd
  );

  // Activity in period
  const loanStats = await db.getFirstAsync<{
    new_lent: number | null;
    new_borrowed: number | null;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'lent' THEN principal_paise ELSE 0 END), 0) AS new_lent,
       COALESCE(SUM(CASE WHEN type = 'borrowed' THEN principal_paise ELSE 0 END), 0) AS new_borrowed
     FROM loans
     WHERE person_id = ? AND date >= ? AND date <= ?;`,
    [personId, startDate, endDate]
  );

  const receivedRow = await db.getFirstAsync<{ received: number | null }>(
    `SELECT COALESCE(SUM(r.amount_paise), 0) AS received
     FROM loan_repayments r
     JOIN loans l ON r.loan_id = l.id
     WHERE l.person_id = ? AND l.type = 'lent' AND r.date >= ? AND r.date <= ?;`,
    [personId, startDate, endDate]
  );

  const madeRow = await db.getFirstAsync<{ made: number | null }>(
    `SELECT COALESCE(SUM(r.amount_paise), 0) AS made
     FROM loan_repayments r
     JOIN loans l ON r.loan_id = l.id
     WHERE l.person_id = ? AND l.type = 'borrowed' AND r.date >= ? AND r.date <= ?;`,
    [personId, startDate, endDate]
  );

  // Current snapshot balances
  const balances = await db.getFirstAsync<{
    outstanding_receivables: number | null;
    outstanding_payables: number | null;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'lent' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS outstanding_receivables,
       COALESCE(SUM(CASE WHEN type = 'borrowed' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS outstanding_payables
     FROM loans
     WHERE person_id = ?;`,
    [personId]
  );

  const newLentPaise = loanStats?.new_lent ?? 0;
  const newBorrowedPaise = loanStats?.new_borrowed ?? 0;
  const repaymentsReceivedPaise = receivedRow?.received ?? 0;
  const repaymentsMadePaise = madeRow?.made ?? 0;

  const currentOutstandingReceivablesPaise = balances?.outstanding_receivables ?? 0;
  const currentOutstandingPayablesPaise = balances?.outstanding_payables ?? 0;
  const currentNetReceivablePaise =
    currentOutstandingReceivablesPaise - currentOutstandingPayablesPaise;

  // Monthly breakdown for trend chart
  const months = getMonthsBetween(startDate, endDate);

  // Query monthly loan totals
  const monthlyLoans = await db.getAllAsync<{
    month: string;
    lent_paise: number;
    borrowed_paise: number;
  }>(
    `SELECT
       substr(date, 1, 7) AS month,
       COALESCE(SUM(CASE WHEN type = 'lent' THEN principal_paise ELSE 0 END), 0) AS lent_paise,
       COALESCE(SUM(CASE WHEN type = 'borrowed' THEN principal_paise ELSE 0 END), 0) AS borrowed_paise
     FROM loans
     WHERE person_id = ? AND date >= ? AND date <= ?
     GROUP BY substr(date, 1, 7);`,
    [personId, startDate, endDate]
  );

  // Query monthly repayment totals
  const monthlyRepayments = await db.getAllAsync<{
    month: string;
    received_paise: number;
    made_paise: number;
  }>(
    `SELECT
       substr(r.date, 1, 7) AS month,
       COALESCE(SUM(CASE WHEN l.type = 'lent' THEN r.amount_paise ELSE 0 END), 0) AS received_paise,
       COALESCE(SUM(CASE WHEN l.type = 'borrowed' THEN r.amount_paise ELSE 0 END), 0) AS made_paise
     FROM loan_repayments r
     JOIN loans l ON r.loan_id = l.id
     WHERE l.person_id = ? AND r.date >= ? AND r.date <= ?
     GROUP BY substr(r.date, 1, 7);`,
    [personId, startDate, endDate]
  );

  const loanMap = new Map(monthlyLoans.map((m) => [m.month, m]));
  const repMap = new Map(monthlyRepayments.map((m) => [m.month, m]));

  const monthlyBreakdown: PersonMonthlyBreakdown[] = months.map((m) => {
    const lData = loanMap.get(m);
    const rData = repMap.get(m);
    return {
      month: m,
      monthLabel: formatMonthShort(m),
      lentPaise: lData?.lent_paise ?? 0,
      borrowedPaise: lData?.borrowed_paise ?? 0,
      repaymentsReceivedPaise: rData?.received_paise ?? 0,
      repaymentsMadePaise: rData?.made_paise ?? 0,
    };
  });

  return {
    personId,
    preset,
    startDate,
    endDate,
    periodLabel: label,
    newLentPaise,
    newBorrowedPaise,
    repaymentsReceivedPaise,
    repaymentsMadePaise,
    currentOutstandingReceivablesPaise,
    currentOutstandingPayablesPaise,
    currentNetReceivablePaise,
    monthlyBreakdown,
  };
}

/**
 * 4. Loan performance details for all loans belonging to a person.
 * Calculates repayment progress from actual records and safely handles
 * 0 or negative principal values.
 */
export async function getPersonLoanPerformances(
  db: DatabaseExecutor,
  personId: string
): Promise<LoanPerformance[]> {
  const loans = await getLoans(db, { personId });

  const performances: LoanPerformance[] = [];
  for (const loan of loans) {
    const repayments = await getRepaymentsForLoan(db, loan.id);
    const principal = loan.principalPaise;
    const repaid = loan.repaidPaise;
    const remaining = loan.outstandingPaise;

    const percentage =
      principal > 0 ? Math.min(100, Math.round((repaid / principal) * 100)) : 0;

    performances.push({
      loanId: loan.id,
      personId: loan.personId,
      type: loan.type,
      description: loan.description,
      originalPrincipalPaise: principal,
      totalRepaidPaise: repaid,
      remainingBalancePaise: remaining,
      repaymentPercentage: percentage,
      loanDate: loan.date,
      dueDate: loan.dueDate,
      isClosed: loan.isClosed,
      accountName: loan.accountName,
      repaymentsCount: repayments.length,
      repayments,
    });
  }

  return performances;
}
