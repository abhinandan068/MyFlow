/**
 * Loans & Repayments repository for MyFlow.
 * Handles Lending (Receivables) and Borrowing (Payables) with:
 * - Integer paise precision
 * - Atomic SQLite balance updates
 * - Partial and full repayments with over-repayment prevention
 * - Complete loan and repayment history
 */
import {
  Loan,
  LoanWithDetails,
  CreateLoanInput,
  CreateRepaymentInput,
  LoanRepaymentWithDetails,
  LendingSummary,
  LoanType,
} from '../types';
import { DatabaseExecutor } from './types';
import { generateId } from '../utils/id';

interface LoanRow {
  id: string;
  person_id: string;
  type: LoanType;
  principal_paise: number;
  repaid_paise: number;
  account_id: string;
  description: string;
  note: string | null;
  date: string;
  due_date: string | null;
  is_closed: number;
  created_at: string;
  updated_at: string;
  person_name?: string;
  person_phone?: string | null;
  person_avatar_color?: string;
  account_name?: string;
  account_color?: string;
  account_icon?: string;
}

interface RepaymentRow {
  id: string;
  loan_id: string;
  amount_paise: number;
  account_id: string;
  note: string | null;
  date: string;
  created_at: string;
  account_name: string;
  account_color: string;
  account_icon: string;
}

function mapRowToLoanWithDetails(row: LoanRow): LoanWithDetails {
  const principal = row.principal_paise;
  const repaid = row.repaid_paise;
  const outstanding = Math.max(0, principal - repaid);

  return {
    id: row.id,
    personId: row.person_id,
    type: row.type,
    principalPaise: principal,
    repaidPaise: repaid,
    outstandingPaise: outstanding,
    accountId: row.account_id,
    description: row.description || (row.type === 'lent' ? 'Money Lent' : 'Money Borrowed'),
    note: row.note,
    date: row.date,
    dueDate: row.due_date,
    isClosed: Boolean(row.is_closed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    personName: row.person_name ?? 'Unknown Person',
    personPhone: row.person_phone,
    personAvatarColor: row.person_avatar_color ?? '#B5A0FF',
    accountName: row.account_name ?? 'Account',
    accountColor: row.account_color ?? '#B5A0FF',
    accountIcon: row.account_icon ?? 'wallet',
  };
}

export function validateLoanInput(input: CreateLoanInput): void {
  if (
    typeof input.principalPaise !== 'number' ||
    !Number.isInteger(input.principalPaise) ||
    input.principalPaise <= 0
  ) {
    throw new Error('Principal amount must be a positive integer in paise (greater than 0)');
  }

  if (!input.description || !input.description.trim()) {
    throw new Error('Description is required');
  }

  if (!input.personId || !input.personId.trim()) {
    throw new Error('Person is required');
  }

  if (!input.accountId || !input.accountId.trim()) {
    throw new Error('Account is required');
  }

  if (!input.date || !input.date.trim()) {
    throw new Error('Transaction date is required');
  }
}

export async function createLoan(
  db: DatabaseExecutor,
  input: CreateLoanInput
): Promise<LoanWithDetails> {
  validateLoanInput(input);

  const id = input.id || `loan_${generateId()}`;
  const now = new Date().toISOString();
  const description = input.description.trim();
  const note = input.note?.trim() || null;
  const dueDate = input.dueDate?.trim() || null;

  await db.withTransactionAsync(async () => {
    // 1. Verify person exists
    const person = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM persons WHERE id = ?;',
      [input.personId]
    );
    if (!person) {
      throw new Error(`Person not found: ${input.personId}`);
    }

    // 2. Verify account exists
    const account = await db.getFirstAsync<{ id: string; balance_paise: number }>(
      'SELECT id, balance_paise FROM accounts WHERE id = ?;',
      [input.accountId]
    );
    if (!account) {
      throw new Error(`Account not found: ${input.accountId}`);
    }

    // 3. Update account balance
    if (input.type === 'lent') {
      // Money lent: funds decrease from user's account
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [input.principalPaise, now, input.accountId]
      );
    } else {
      // Money borrowed: funds increase in user's account
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [input.principalPaise, now, input.accountId]
      );
    }

    // 4. Insert loan record
    await db.runAsync(
      `INSERT INTO loans (id, person_id, type, principal_paise, repaid_paise, account_id, description, note, date, due_date, is_closed, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?, ?);`,
      [
        id,
        input.personId,
        input.type,
        input.principalPaise,
        input.accountId,
        description,
        note,
        input.date,
        dueDate,
        now,
        now,
      ]
    );
  });

  const created = await getLoanById(db, id);
  if (!created) {
    throw new Error('Failed to retrieve newly created loan');
  }
  return created;
}

export async function createRepayment(
  db: DatabaseExecutor,
  input: CreateRepaymentInput
): Promise<LoanWithDetails> {
  if (
    typeof input.amountPaise !== 'number' ||
    !Number.isInteger(input.amountPaise) ||
    input.amountPaise <= 0
  ) {
    throw new Error('Repayment amount must be a positive integer in paise');
  }

  if (!input.accountId || !input.accountId.trim()) {
    throw new Error('Account is required for repayment');
  }

  if (!input.date || !input.date.trim()) {
    throw new Error('Repayment date is required');
  }

  const repaymentId = input.id || `rep_${generateId()}`;
  const now = new Date().toISOString();
  const note = input.note?.trim() || null;

  await db.withTransactionAsync(async () => {
    // 1. Fetch loan
    const loan = await db.getFirstAsync<LoanRow>(
      'SELECT * FROM loans WHERE id = ?;',
      [input.loanId]
    );
    if (!loan) {
      throw new Error(`Loan not found: ${input.loanId}`);
    }

    if (loan.is_closed) {
      throw new Error('This loan is already fully settled');
    }

    const outstanding = loan.principal_paise - loan.repaid_paise;
    if (input.amountPaise > outstanding) {
      throw new Error(
        `Repayment amount of ₹${(input.amountPaise / 100).toFixed(
          2
        )} exceeds the outstanding balance of ₹${(outstanding / 100).toFixed(2)}`
      );
    }

    // 2. Verify account exists
    const account = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM accounts WHERE id = ?;',
      [input.accountId]
    );
    if (!account) {
      throw new Error(`Account not found: ${input.accountId}`);
    }

    // 3. Update account balance
    if (loan.type === 'lent') {
      // Money received from borrower: user's account increases
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
    } else {
      // Money paid back to lender: user's account decreases
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [input.amountPaise, now, input.accountId]
      );
    }

    // 4. Update loan repaid amount & status
    const newRepaid = loan.repaid_paise + input.amountPaise;
    const isClosed = newRepaid >= loan.principal_paise ? 1 : 0;

    await db.runAsync(
      'UPDATE loans SET repaid_paise = ?, is_closed = ?, updated_at = ? WHERE id = ?;',
      [newRepaid, isClosed, now, input.loanId]
    );

    // 5. Insert repayment record
    await db.runAsync(
      `INSERT INTO loan_repayments (id, loan_id, amount_paise, account_id, note, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [repaymentId, input.loanId, input.amountPaise, input.accountId, note, input.date, now]
    );
  });

  const updatedLoan = await getLoanById(db, input.loanId);
  if (!updatedLoan) {
    throw new Error('Failed to retrieve updated loan');
  }
  return updatedLoan;
}

export async function getLoans(
  db: DatabaseExecutor,
  filter?: {
    personId?: string;
    type?: LoanType;
    isClosed?: boolean;
    search?: string;
  }
): Promise<LoanWithDetails[]> {
  const whereClauses: string[] = ['1=1'];
  const params: any[] = [];

  if (filter?.personId) {
    whereClauses.push('l.person_id = ?');
    params.push(filter.personId);
  }

  if (filter?.type) {
    whereClauses.push('l.type = ?');
    params.push(filter.type);
  }

  if (filter?.isClosed !== undefined) {
    whereClauses.push('l.is_closed = ?');
    params.push(filter.isClosed ? 1 : 0);
  }

  if (filter?.search && filter.search.trim()) {
    const term = `%${filter.search.trim()}%`;
    whereClauses.push('(l.description LIKE ? OR l.note LIKE ? OR p.name LIKE ?)');
    params.push(term, term, term);
  }

  const query = `
    SELECT
      l.id, l.person_id, l.type, l.principal_paise, l.repaid_paise, l.account_id,
      l.description, l.note, l.date, l.due_date, l.is_closed, l.created_at, l.updated_at,
      p.name AS person_name, p.phone AS person_phone, p.avatar_color AS person_avatar_color,
      a.name AS account_name, a.color AS account_color, a.icon AS account_icon
    FROM loans l
    LEFT JOIN persons p ON l.person_id = p.id
    LEFT JOIN accounts a ON l.account_id = a.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY l.is_closed ASC, l.date DESC, l.created_at DESC;
  `;

  const rows = await db.getAllAsync<LoanRow>(query, params);
  return rows.map(mapRowToLoanWithDetails);
}

export async function getLoanById(
  db: DatabaseExecutor,
  id: string
): Promise<LoanWithDetails | null> {
  const query = `
    SELECT
      l.id, l.person_id, l.type, l.principal_paise, l.repaid_paise, l.account_id,
      l.description, l.note, l.date, l.due_date, l.is_closed, l.created_at, l.updated_at,
      p.name AS person_name, p.phone AS person_phone, p.avatar_color AS person_avatar_color,
      a.name AS account_name, a.color AS account_color, a.icon AS account_icon
    FROM loans l
    LEFT JOIN persons p ON l.person_id = p.id
    LEFT JOIN accounts a ON l.account_id = a.id
    WHERE l.id = ?;
  `;

  const row = await db.getFirstAsync<LoanRow>(query, [id]);
  return row ? mapRowToLoanWithDetails(row) : null;
}

export async function getRepaymentsForLoan(
  db: DatabaseExecutor,
  loanId: string
): Promise<LoanRepaymentWithDetails[]> {
  const query = `
    SELECT
      r.id, r.loan_id, r.amount_paise, r.account_id, r.note, r.date, r.created_at,
      a.name AS account_name, a.color AS account_color, a.icon AS account_icon
    FROM loan_repayments r
    LEFT JOIN accounts a ON r.account_id = a.id
    WHERE r.loan_id = ?
    ORDER BY r.date DESC, r.created_at DESC;
  `;

  const rows = await db.getAllAsync<RepaymentRow>(query, [loanId]);
  return rows.map((r) => ({
    id: r.id,
    loanId: r.loan_id,
    amountPaise: r.amount_paise,
    accountId: r.account_id,
    note: r.note,
    date: r.date,
    createdAt: r.created_at,
    accountName: r.account_name ?? 'Account',
    accountColor: r.account_color ?? '#B5A0FF',
    accountIcon: r.account_icon ?? 'wallet',
  }));
}

export async function getLendingSummary(
  db: DatabaseExecutor
): Promise<LendingSummary> {
  const row = await db.getFirstAsync<{
    receivables: number | null;
    payables: number | null;
    active_lent: number | null;
    active_borrowed: number | null;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'lent' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS receivables,
      COALESCE(SUM(CASE WHEN type = 'borrowed' AND is_closed = 0 THEN (principal_paise - repaid_paise) ELSE 0 END), 0) AS payables,
      COALESCE(COUNT(CASE WHEN type = 'lent' AND is_closed = 0 THEN 1 END), 0) AS active_lent,
      COALESCE(COUNT(CASE WHEN type = 'borrowed' AND is_closed = 0 THEN 1 END), 0) AS active_borrowed
    FROM loans;
  `);

  return {
    totalReceivablesPaise: row?.receivables ?? 0,
    totalPayablesPaise: row?.payables ?? 0,
    activeLentCount: row?.active_lent ?? 0,
    activeBorrowedCount: row?.active_borrowed ?? 0,
  };
}

export async function deleteLoan(
  db: DatabaseExecutor,
  id: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const loan = await db.getFirstAsync<LoanRow>(
      'SELECT * FROM loans WHERE id = ?;',
      [id]
    );
    if (!loan) throw new Error(`Loan not found: ${id}`);

    const now = new Date().toISOString();

    // 1. Reverse repayments on accounts
    const repayments = await db.getAllAsync<{ amount_paise: number; account_id: string }>(
      'SELECT amount_paise, account_id FROM loan_repayments WHERE loan_id = ?;',
      [id]
    );
    for (const rep of repayments) {
      if (loan.type === 'lent') {
        // Reverse received repayment: subtract from account
        await db.runAsync(
          'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
          [rep.amount_paise, now, rep.account_id]
        );
      } else {
        // Reverse paid repayment: add back to account
        await db.runAsync(
          'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
          [rep.amount_paise, now, rep.account_id]
        );
      }
    }

    // 2. Reverse principal on account
    if (loan.type === 'lent') {
      // Re-add lent money back to user account
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [loan.principal_paise, now, loan.account_id]
      );
    } else {
      // Deduct borrowed money from user account
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [loan.principal_paise, now, loan.account_id]
      );
    }

    // 3. Delete repayments and loan
    await db.runAsync('DELETE FROM loan_repayments WHERE loan_id = ?;', [id]);
    await db.runAsync('DELETE FROM loans WHERE id = ?;', [id]);
  });
}

export async function deleteRepayment(
  db: DatabaseExecutor,
  repaymentId: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    // 1. Fetch repayment record
    const rep = await db.getFirstAsync<{
      id: string;
      loan_id: string;
      amount_paise: number;
      account_id: string;
    }>('SELECT id, loan_id, amount_paise, account_id FROM loan_repayments WHERE id = ?;', [
      repaymentId,
    ]);
    if (!rep) {
      throw new Error(`Repayment not found: ${repaymentId}`);
    }

    // 2. Fetch loan
    const loan = await db.getFirstAsync<{
      id: string;
      type: LoanType;
      principal_paise: number;
      repaid_paise: number;
    }>('SELECT id, type, principal_paise, repaid_paise FROM loans WHERE id = ?;', [rep.loan_id]);
    if (!loan) {
      throw new Error(`Associated loan not found: ${rep.loan_id}`);
    }

    const now = new Date().toISOString();

    // 3. Reverse account balance
    if (loan.type === 'lent') {
      // Repayment was received from borrower -> user account had increased. Reverse: subtract
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise - ?, updated_at = ? WHERE id = ?;',
        [rep.amount_paise, now, rep.account_id]
      );
    } else {
      // Repayment was paid to lender -> user account had decreased. Reverse: add back
      await db.runAsync(
        'UPDATE accounts SET balance_paise = balance_paise + ?, updated_at = ? WHERE id = ?;',
        [rep.amount_paise, now, rep.account_id]
      );
    }

    // 4. Update loan's repaid_paise and reopen if was closed
    const newRepaid = Math.max(0, loan.repaid_paise - rep.amount_paise);
    const isClosed = newRepaid >= loan.principal_paise ? 1 : 0;
    await db.runAsync(
      'UPDATE loans SET repaid_paise = ?, is_closed = ?, updated_at = ? WHERE id = ?;',
      [newRepaid, isClosed, now, rep.loan_id]
    );

    // 5. Delete the repayment row
    await db.runAsync('DELETE FROM loan_repayments WHERE id = ?;', [repaymentId]);
  });
}
