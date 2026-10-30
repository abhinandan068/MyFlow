/**
 * Database executor interface for MyFlow.
 * Matches expo-sqlite SQLiteDatabase methods.
 */
export interface DatabaseExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T = any>(source: string, ...params: any[]): Promise<T | null>;
  getAllAsync<T = any>(source: string, ...params: any[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
