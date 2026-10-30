/**
 * Root layout — wraps the entire app with SQLiteProvider and global providers.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { migrateDatabase, DB_NAME } from '@/db/schema';
import {
  syncReminderFromDb,
  setupNotificationChannel,
} from '@/services/notifications';

export default function RootLayout() {
  const handleDbInit = async (db: any) => {
    await migrateDatabase(db);
    await setupNotificationChannel();
    await syncReminderFromDb(db);
  };

  return (
    <SafeAreaProvider style={styles.container}>
      <SQLiteProvider databaseName={DB_NAME} onInit={handleDbInit}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
          }}
        />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
