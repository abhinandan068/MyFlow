/**
 * Daily Transaction Reminder Service — MyFlow
 * Implements reliable, non-duplicating local notifications for Android and iOS using expo-notifications.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { DatabaseExecutor } from '@/db/types';
import { getSetting, setSetting } from '@/db/settingsRepository';

export const REMINDER_CHANNEL_ID = 'daily-reminders';
export const REMINDER_TITLE = 'Daily Expense Check-in';
export const REMINDER_BODY =
  'Did you make any purchases today? Log them in MyFlow to keep your budget on track!';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

/**
 * Configure Android notification channel
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: 'Daily Expense Reminders',
        description: 'Daily prompt to record your expenses and track your budget',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#B5A0FF',
      });
    } catch (err) {
      console.warn('Failed to setup notification channel:', err);
    }
  }
}

/**
 * Request notification permissions with status return
 */
export async function requestNotificationPermission(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      return { granted: true, canAskAgain: existing.canAskAgain };
    }

    const requested = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return {
      granted: requested.granted,
      canAskAgain: requested.canAskAgain,
    };
  } catch (err) {
    console.warn('Failed to request notification permission:', err);
    return { granted: false, canAskAgain: false };
  }
}

/**
 * Check current notification permission status
 */
export async function checkNotificationPermission(): Promise<boolean> {
  try {
    const perms = await Notifications.getPermissionsAsync();
    return perms.granted;
  } catch {
    return false;
  }
}

import { parseTimeString } from '@/utils/date';
export { parseTimeString };

/**
 * Schedule daily reminder at specified hour and minute.
 * Always cancels existing scheduled reminders to strictly prevent duplicates.
 */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  db?: DatabaseExecutor
): Promise<{ success: boolean; identifier?: string; error?: string }> {
  try {
    await setupNotificationChannel();

    // 1. Cancel any existing scheduled notifications to avoid duplicates
    await Notifications.cancelAllScheduledNotificationsAsync();

    // 2. Schedule daily trigger
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: REMINDER_TITLE,
        body: REMINDER_BODY,
        sound: true,
        data: { screen: '/(tabs)/add' },
      },
      trigger: {
        type: 'daily',
        hour,
        minute,
        channelId: REMINDER_CHANNEL_ID,
      } as any,
    });

    // 3. Persist settings if db is provided
    if (db) {
      const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      await setSetting(db, 'notificationsEnabled', 'true');
      await setSetting(db, 'reminderTime', timeStr);
      await setSetting(db, 'reminder_onboarding_completed', 'true');
    }

    return { success: true, identifier };
  } catch (err: any) {
    console.error('Failed to schedule daily reminder:', err);
    return {
      success: false,
      error: err.message || 'Failed to schedule reminder',
    };
  }
}

/**
 * Cancel daily reminder and update settings
 */
export async function cancelDailyReminder(
  db?: DatabaseExecutor
): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (db) {
      await setSetting(db, 'notificationsEnabled', 'false');
    }
  } catch (err) {
    console.warn('Failed to cancel reminders:', err);
  }
}

/**
 * Send an immediate test notification
 */
export async function sendImmediateTestReminder(): Promise<boolean> {
  try {
    await setupNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'MyFlow Reminder Test',
        body: 'Notifications are working! Your daily reminder is configured and active.',
        sound: true,
      },
      trigger: null,
    });
    return true;
  } catch (err) {
    console.warn('Failed to send test notification:', err);
    return false;
  }
}

/**
 * Synchronize reminder schedule from database on application launch
 */
export async function syncReminderFromDb(db: DatabaseExecutor): Promise<void> {
  try {
    const enabledStr = await getSetting(db, 'notificationsEnabled', 'false');
    if (enabledStr === 'true') {
      const isGranted = await checkNotificationPermission();
      if (isGranted) {
        const timeStr = await getSetting(db, 'reminderTime', '21:00');
        const { hour, minute } = parseTimeString(timeStr);
        await scheduleDailyReminder(hour, minute);
      }
    }
  } catch (err) {
    console.warn('Failed to sync reminder from db:', err);
  }
}
