/**
 * Settings repository for MyFlow.
 * Handles key-value settings storage in SQLite.
 */
import { DatabaseExecutor } from './types';

export async function getSetting(
  db: DatabaseExecutor,
  key: string,
  defaultValue: string = ''
): Promise<string> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?;',
    [key]
  );
  return row ? row.value : defaultValue;
}

export async function setSetting(
  db: DatabaseExecutor,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value]
  );
}

export async function getAllSettings(
  db: DatabaseExecutor
): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings;'
  );
  const result: Record<string, string> = {};
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}
