/**
 * Native Data Backup, CSV Sharing, and Document Picker Integration — MyFlow
 * Uses pure database logic from backupRepository and connects with native Expo APIs.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { DatabaseExecutor } from '@/db/types';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  APP_IDENTIFIER,
  BackupMetadata,
  BackupData,
  FullBackupPayload,
  escapeCSVCell,
  generateTransactionsCSV,
  createFullBackupPayload,
  validateBackupPayload,
  executeRestore,
} from '@/db/backupRepository';

export {
  CURRENT_BACKUP_SCHEMA_VERSION,
  APP_IDENTIFIER,
  BackupMetadata,
  BackupData,
  FullBackupPayload,
  escapeCSVCell,
  generateTransactionsCSV,
  createFullBackupPayload,
  validateBackupPayload,
  executeRestore,
};

/**
 * Export all transactions to CSV file and trigger Android share dialog
 */
export async function exportTransactionsToCSV(
  db: DatabaseExecutor
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const rows = await db.getAllAsync<any>(`
      SELECT
        t.id, t.type, t.amount_paise, t.description, t.note, t.date, t.created_at,
        t.account_id, a.name AS account_name,
        t.to_account_id, a_to.name AS to_account_name,
        t.category_id, c.name AS category_name
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts a_to ON t.to_account_id = a_to.id
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY t.date DESC, t.created_at DESC;
    `);

    const csvContent = generateTransactionsCSV(rows);
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15);
    const fileName = `myflow_transactions_${timestamp}.csv`;
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDir) {
      throw new Error('Storage directory unavailable');
    }
    const fileUri = `${baseDir}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export MyFlow Transactions (CSV)',
        UTI: 'public.comma-separated-values-text',
      });
    }

    return { success: true, filePath: fileUri };
  } catch (err: any) {
    console.error('Failed to export transactions CSV:', err);
    return { success: false, error: err.message || 'Failed to export CSV' };
  }
}

/**
 * Export full backup to a file and share
 */
export async function exportFullBackup(
  db: DatabaseExecutor
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const payload = await createFullBackupPayload(db);
    const jsonString = JSON.stringify(payload, null, 2);

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15);
    const fileName = `myflow_backup_${timestamp}.json`;
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDir) {
      throw new Error('Storage directory unavailable');
    }
    const fileUri = `${baseDir}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export MyFlow Full Backup',
        UTI: 'public.json',
      });
    }

    return { success: true, filePath: fileUri };
  } catch (err: any) {
    console.error('Failed to export full backup:', err);
    return { success: false, error: err.message || 'Failed to export backup' };
  }
}

/**
 * Open file picker and parse selected backup file
 */
export async function pickAndReadBackupFile(): Promise<{
  canceled: boolean;
  payload?: FullBackupPayload;
  error?: string;
}> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/json', '*/*'],
      copyToCacheDirectory: true,
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return { canceled: true };
    }

    const file = res.assets[0];
    const content = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      return { canceled: false, error: 'File is not a valid JSON document' };
    }

    const validation = validateBackupPayload(parsed);
    if (!validation.valid) {
      return { canceled: false, error: validation.error };
    }

    return { canceled: false, payload: parsed as FullBackupPayload };
  } catch (err: any) {
    console.error('Failed to pick backup file:', err);
    return { canceled: false, error: err.message || 'Failed to read backup file' };
  }
}
