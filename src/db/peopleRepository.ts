/**
 * People repository for MyFlow.
 * Handles directory of contacts for lending and borrowing.
 */
import { Person, PersonWithTotals } from '../types';
import { DatabaseExecutor } from './types';
import { generateId } from '../utils/id';

interface PersonRow {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  avatar_color: string;
  created_at: string;
  updated_at: string;
  total_lent_paise?: number;
  total_lent_outstanding_paise?: number;
  total_borrowed_paise?: number;
  total_borrowed_outstanding_paise?: number;
  active_loan_count?: number;
  settled_loan_count?: number;
}

function mapRowToPersonWithTotals(row: PersonRow): PersonWithTotals {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    notes: row.notes,
    avatarColor: row.avatar_color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalLentPaise: row.total_lent_paise ?? 0,
    totalLentOutstandingPaise: row.total_lent_outstanding_paise ?? 0,
    totalBorrowedPaise: row.total_borrowed_paise ?? 0,
    totalBorrowedOutstandingPaise: row.total_borrowed_outstanding_paise ?? 0,
    activeLoanCount: row.active_loan_count ?? 0,
    settledLoanCount: row.settled_loan_count ?? 0,
  };
}

export async function getPeople(
  db: DatabaseExecutor,
  search?: string
): Promise<PersonWithTotals[]> {
  const whereClauses: string[] = ['1=1'];
  const params: any[] = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    whereClauses.push('(p.name LIKE ? OR p.phone LIKE ? OR p.notes LIKE ?)');
    params.push(term, term, term);
  }

  const query = `
    SELECT
      p.id, p.name, p.phone, p.notes, p.avatar_color, p.created_at, p.updated_at,
      COALESCE(SUM(CASE WHEN l.type = 'lent' THEN l.principal_paise ELSE 0 END), 0) AS total_lent_paise,
      COALESCE(SUM(CASE WHEN l.type = 'lent' AND l.is_closed = 0 THEN (l.principal_paise - l.repaid_paise) ELSE 0 END), 0) AS total_lent_outstanding_paise,
      COALESCE(SUM(CASE WHEN l.type = 'borrowed' THEN l.principal_paise ELSE 0 END), 0) AS total_borrowed_paise,
      COALESCE(SUM(CASE WHEN l.type = 'borrowed' AND l.is_closed = 0 THEN (l.principal_paise - l.repaid_paise) ELSE 0 END), 0) AS total_borrowed_outstanding_paise,
      COALESCE(COUNT(CASE WHEN l.is_closed = 0 AND l.id IS NOT NULL THEN 1 END), 0) AS active_loan_count,
      COALESCE(COUNT(CASE WHEN l.is_closed = 1 AND l.id IS NOT NULL THEN 1 END), 0) AS settled_loan_count
    FROM persons p
    LEFT JOIN loans l ON p.id = l.person_id
    WHERE ${whereClauses.join(' AND ')}
    GROUP BY p.id
    ORDER BY (total_lent_outstanding_paise + total_borrowed_outstanding_paise) DESC, p.name ASC;
  `;

  const rows = await db.getAllAsync<PersonRow>(query, params);
  return rows.map(mapRowToPersonWithTotals);
}

export async function getPersonById(
  db: DatabaseExecutor,
  id: string
): Promise<PersonWithTotals | null> {
  const query = `
    SELECT
      p.id, p.name, p.phone, p.notes, p.avatar_color, p.created_at, p.updated_at,
      COALESCE(SUM(CASE WHEN l.type = 'lent' THEN l.principal_paise ELSE 0 END), 0) AS total_lent_paise,
      COALESCE(SUM(CASE WHEN l.type = 'lent' AND l.is_closed = 0 THEN (l.principal_paise - l.repaid_paise) ELSE 0 END), 0) AS total_lent_outstanding_paise,
      COALESCE(SUM(CASE WHEN l.type = 'borrowed' THEN l.principal_paise ELSE 0 END), 0) AS total_borrowed_paise,
      COALESCE(SUM(CASE WHEN l.type = 'borrowed' AND l.is_closed = 0 THEN (l.principal_paise - l.repaid_paise) ELSE 0 END), 0) AS total_borrowed_outstanding_paise,
      COALESCE(COUNT(CASE WHEN l.is_closed = 0 AND l.id IS NOT NULL THEN 1 END), 0) AS active_loan_count,
      COALESCE(COUNT(CASE WHEN l.is_closed = 1 AND l.id IS NOT NULL THEN 1 END), 0) AS settled_loan_count
    FROM persons p
    LEFT JOIN loans l ON p.id = l.person_id
    WHERE p.id = ?
    GROUP BY p.id;
  `;

  const row = await db.getFirstAsync<PersonRow>(query, [id]);
  return row ? mapRowToPersonWithTotals(row) : null;
}

export async function createPerson(
  db: DatabaseExecutor,
  data: {
    id?: string;
    name: string;
    phone?: string | null;
    notes?: string | null;
    avatarColor?: string;
  }
): Promise<Person> {
  const trimmedName = data.name.trim();
  if (!trimmedName) {
    throw new Error('Person name is required');
  }

  const id = data.id || `per_${generateId()}`;
  const now = new Date().toISOString();
  const phone = data.phone?.trim() || null;
  const notes = data.notes?.trim() || null;
  const avatarColor = data.avatarColor || '#B5A0FF';

  await db.runAsync(
    `INSERT INTO persons (id, name, phone, notes, avatar_color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?);`,
    [id, trimmedName, phone, notes, avatarColor, now, now]
  );

  return {
    id,
    name: trimmedName,
    phone,
    notes,
    avatarColor,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updatePerson(
  db: DatabaseExecutor,
  id: string,
  data: {
    name?: string;
    phone?: string | null;
    notes?: string | null;
    avatarColor?: string;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  if (data.name !== undefined) {
    const trimmed = data.name.trim();
    if (!trimmed) throw new Error('Person name cannot be empty');
    fields.push('name = ?');
    params.push(trimmed);
  }
  if (data.phone !== undefined) {
    fields.push('phone = ?');
    params.push(data.phone?.trim() || null);
  }
  if (data.notes !== undefined) {
    fields.push('notes = ?');
    params.push(data.notes?.trim() || null);
  }
  if (data.avatarColor !== undefined) {
    fields.push('avatar_color = ?');
    params.push(data.avatarColor);
  }

  params.push(id);
  await db.runAsync(
    `UPDATE persons SET ${fields.join(', ')} WHERE id = ?;`,
    params
  );
}

export async function deletePerson(
  db: DatabaseExecutor,
  id: string
): Promise<void> {
  // Check if active loans exist
  const activeLoans = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM loans WHERE person_id = ? AND is_closed = 0;',
    [id]
  );
  if (activeLoans && activeLoans.count > 0) {
    throw new Error('Cannot delete person with active outstanding loans');
  }

  await db.runAsync('DELETE FROM persons WHERE id = ?;', [id]);
}
