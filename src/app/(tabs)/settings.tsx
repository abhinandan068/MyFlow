/**
 * Settings Screen — MyFlow
 * Complete application configuration and data management:
 * - Financial tools navigation (Analytics, Budgets, People)
 * - Account management (View, Add, Edit, Safe Delete with dependency check)
 * - Category management (View, Add, Edit, Delete custom categories)
 * - Daily reminder configuration (Enable/disable, time selector, permissions, test reminder)
 * - Data portability (CSV export with share sheet, Full JSON backup, Atomic restore)
 * - General information (Version, currency, storage engine)
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { Account, AccountType, Category } from '@/types';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountDependentCounts,
} from '@/db/accountsRepository';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '@/db/categoriesRepository';
import { getSetting, setSetting } from '@/db/settingsRepository';
import { formatCurrency, parseToPaise } from '@/utils/currency';
import {
  scheduleDailyReminder,
  cancelDailyReminder,
  checkNotificationPermission,
  requestNotificationPermission,
  parseTimeString,
  sendImmediateTestReminder,
} from '@/services/notifications';
import {
  exportTransactionsToCSV,
  exportFullBackup,
  pickAndReadBackupFile,
  executeRestore,
  FullBackupPayload,
} from '@/services/dataBackup';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank Account',
  upi: 'UPI / Digital Wallet',
  cash: 'Physical Cash',
  credit: 'Credit Card',
  other: 'Other Account',
};

const PALETTE = [
  '#B5A0FF', '#60A5FA', '#4ADE80', '#FB7185',
  '#FBBF24', '#34D399', '#F472B6', '#818CF8',
  '#A3E635', '#E879F9', '#FB923C', '#2DD4BF',
];

const ICONS = [
  'wallet', 'business', 'phone-portrait', 'cash', 'card',
  'restaurant', 'cart', 'flash', 'medical', 'school',
  'film', 'basket', 'home', 'briefcase', 'gift', 'tag',
];

export default function SettingsScreen() {
  const db = useSQLiteContext();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryTab, setCategoryTab] = useState<'expense' | 'income'>('expense');

  // Reminders state
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');
  const [hasPermission, setHasPermission] = useState(true);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [tempHour, setTempHour] = useState(21);
  const [tempMinute, setTempMinute] = useState(0);

  // Accounts modal state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('bank');
  const [accBalance, setAccBalance] = useState('');
  const [accColor, setAccColor] = useState(PALETTE[0]);
  const [accIcon, setAccIcon] = useState('wallet');
  const [accError, setAccError] = useState<string | null>(null);

  // Categories modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'income' | 'expense'>('expense');
  const [catColor, setCatColor] = useState(PALETTE[1]);
  const [catIcon, setCatIcon] = useState('tag');
  const [catError, setCatError] = useState<string | null>(null);

  // Data management state
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restorePayload, setRestorePayload] = useState<FullBackupPayload | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [showRestoreModal, setShowRestoreModal] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [accs, cats, notifEnabled, timeStr] = await Promise.all([
        getAccounts(db),
        getCategories(db),
        getSetting(db, 'notificationsEnabled', 'false'),
        getSetting(db, 'reminderTime', '21:00'),
      ]);

      setAccounts(accs);
      setCategories(cats);
      setRemindersEnabled(notifEnabled === 'true');
      setReminderTime(timeStr);

      const perm = await checkNotificationPermission();
      setHasPermission(perm);
    } catch (err) {
      console.error('Failed to load settings data:', err);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Reminder Toggle Handler
  const handleToggleReminders = async (val: boolean) => {
    if (val) {
      const permResult = await requestNotificationPermission();
      if (!permResult.granted) {
        setHasPermission(false);
        Alert.alert(
          'Permission Required',
          'Notification permission was not granted. Please enable notifications for MyFlow in Android Settings to receive reminders.'
        );
        return;
      }
      setHasPermission(true);
      const { hour, minute } = parseTimeString(reminderTime);
      const result = await scheduleDailyReminder(hour, minute, db);
      if (result.success) {
        setRemindersEnabled(true);
      } else {
        Alert.alert('Error', result.error || 'Failed to schedule daily reminder');
      }
    } else {
      await cancelDailyReminder(db);
      setRemindersEnabled(false);
    }
  };

  const handleSaveReminderTime = async () => {
    const formatted = `${String(tempHour).padStart(2, '0')}:${String(tempMinute).padStart(2, '0')}`;
    setReminderTime(formatted);
    setShowTimeModal(false);

    if (remindersEnabled) {
      await scheduleDailyReminder(tempHour, tempMinute, db);
    } else {
      await setSetting(db, 'reminderTime', formatted);
    }
  };

  const handleSendTestReminder = async () => {
    const ok = await sendImmediateTestReminder();
    if (ok) {
      Alert.alert('Test Notification Sent', 'A local reminder notification was dispatched.');
    } else {
      Alert.alert('Test Failed', 'Could not send notification. Please check app permissions.');
    }
  };

  // Account Modal Handlers
  const handleOpenAddAccount = () => {
    setEditingAccount(null);
    setAccName('');
    setAccType('bank');
    setAccBalance('0');
    setAccColor(PALETTE[0]);
    setAccIcon('business');
    setAccError(null);
    setShowAccountModal(true);
  };

  const handleOpenEditAccount = (acc: Account) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccType(acc.type);
    setAccBalance((acc.balancePaise / 100).toString());
    setAccColor(acc.color);
    setAccIcon(acc.icon);
    setAccError(null);
    setShowAccountModal(true);
  };

  const handleSaveAccount = async () => {
    setAccError(null);
    if (!accName.trim()) {
      setAccError('Account name is required');
      return;
    }

    try {
      if (editingAccount) {
        await updateAccount(db, editingAccount.id, {
          name: accName.trim(),
          type: accType,
          color: accColor,
          icon: accIcon,
        });
      } else {
        const balancePaise = parseToPaise(accBalance || '0');
        await createAccount(db, {
          name: accName.trim(),
          type: accType,
          balancePaise: isNaN(balancePaise) ? 0 : balancePaise,
          color: accColor,
          icon: accIcon,
        });
      }
      setShowAccountModal(false);
      loadData();
    } catch (err: any) {
      setAccError(err.message || 'Failed to save account');
    }
  };

  const handleDeleteAccount = (acc: Account) => {
    Alert.alert(
      `Delete "${acc.name}"?`,
      'Are you sure you want to delete this account? Accounts with transactions or loans cannot be deleted to preserve financial records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(db, acc.id);
              loadData();
            } catch (err: any) {
              Alert.alert('Cannot Delete Account', err.message);
            }
          },
        },
      ]
    );
  };

  // Category Modal Handlers
  const handleOpenAddCategory = () => {
    setEditingCategory(null);
    setCatName('');
    setCatType(categoryTab);
    setCatColor(PALETTE[2]);
    setCatIcon('tag');
    setCatError(null);
    setShowCategoryModal(true);
  };

  const handleOpenEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatType(cat.type === 'both' ? 'expense' : cat.type);
    setCatColor(cat.color);
    setCatIcon(cat.icon);
    setCatError(null);
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async () => {
    setCatError(null);
    if (!catName.trim()) {
      setCatError('Category name is required');
      return;
    }

    try {
      if (editingCategory) {
        await updateCategory(db, editingCategory.id, {
          name: catName.trim(),
          type: catType,
          color: catColor,
          icon: catIcon,
        });
      } else {
        await createCategory(db, {
          name: catName.trim(),
          type: catType,
          color: catColor,
          icon: catIcon,
        });
      }
      setShowCategoryModal(false);
      loadData();
    } catch (err: any) {
      setCatError(err.message || 'Failed to save category');
    }
  };

  const handleDeleteCategory = (cat: Category) => {
    if (cat.isSystem) {
      Alert.alert('System Category', 'Default system categories cannot be deleted.');
      return;
    }

    Alert.alert(
      `Delete "${cat.name}"?`,
      'Deleting this custom category will not erase historical transactions. Their category will safely show as Uncategorized.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(db, cat.id);
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  // Data Management Handlers
  const handleExportCSV = async () => {
    setExportingCSV(true);
    try {
      const res = await exportTransactionsToCSV(db);
      if (!res.success) {
        Alert.alert('Export Failed', res.error || 'Failed to export CSV file.');
      }
    } finally {
      setExportingCSV(false);
    }
  };

  const handleExportBackup = async () => {
    setExportingBackup(true);
    try {
      const res = await exportFullBackup(db);
      if (!res.success) {
        Alert.alert('Backup Failed', res.error || 'Failed to create backup.');
      }
    } finally {
      setExportingBackup(false);
    }
  };

  const handlePickBackupFile = async () => {
    const res = await pickAndReadBackupFile();
    if (res.canceled) return;
    if (res.error || !res.payload) {
      Alert.alert('Invalid Backup', res.error || 'Could not parse backup file.');
      return;
    }

    setRestorePayload(res.payload);
    setRestoreMode('replace');
    setShowRestoreModal(true);
  };

  const handleConfirmRestore = async () => {
    if (!restorePayload) return;

    if (restoreMode === 'replace') {
      Alert.alert(
        'Confirm Replace',
        'This will replace all current financial records in MyFlow with the data in this backup file. Are you sure you want to proceed?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace All Data',
            style: 'destructive',
            onPress: runRestoreExecution,
          },
        ]
      );
    } else {
      runRestoreExecution();
    }
  };

  const runRestoreExecution = async () => {
    if (!restorePayload) return;
    setRestoring(true);
    try {
      const result = await executeRestore(db, restorePayload, restoreMode);
      setShowRestoreModal(false);
      setRestorePayload(null);
      await loadData();
      Alert.alert(
        'Restore Complete',
        `Successfully restored: ${result.restoredCounts.transactions} transactions, ${result.restoredCounts.accounts} accounts, and ${result.restoredCounts.loans} loans.`
      );
    } catch (err: any) {
      Alert.alert('Restore Failed', err.message || 'An error occurred during restore. Data was not modified.');
    } finally {
      setRestoring(false);
    }
  };

  const filteredCategories = categories.filter(
    (c) => c.type === categoryTab || c.type === 'both'
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Settings</Text>

        {/* 1. FINANCIAL TOOLS SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>FINANCIAL INSIGHTS & TOOLS</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/analytics')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: Colors.primary + '25' }]}>
                <Ionicons name="stats-chart" size={20} color={Colors.primary} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Analytics & Reports</Text>
                <Text style={styles.menuDesc}>Cash flow, category breakdown & spending trends</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/budgets')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#38BDF825' }]}>
                <Ionicons name="wallet-outline" size={20} color="#38BDF8" />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Monthly Budgets</Text>
                <Text style={styles.menuDesc}>Set category caps and track spending limits</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => router.push('/(tabs)/people')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#4ADE8025' }]}>
                <Ionicons name="people-outline" size={20} color={Colors.income} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>People & Loans</Text>
                <Text style={styles.menuDesc}>Owed to you, you owe & person financial analysis</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 2. ACCOUNTS MANAGEMENT */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>ACCOUNTS & BALANCES</Text>
            <TouchableOpacity style={styles.addSmallBtn} onPress={handleOpenAddModalAcc => handleOpenAddAccount()}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addSmallBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {accounts.map((acc, idx) => (
              <React.Fragment key={acc.id}>
                <View style={styles.accountRowItem}>
                  <View
                    style={[
                      styles.menuIconWrap,
                      { backgroundColor: acc.color ? `${acc.color}25` : '#27272A' },
                    ]}
                  >
                    <Ionicons
                      name={(acc.icon as any) || 'wallet'}
                      size={18}
                      color={acc.color || Colors.primary}
                    />
                  </View>
                  <View style={styles.menuTextWrap}>
                    <View style={styles.nameBadgeRow}>
                      <Text style={styles.menuTitle}>{acc.name}</Text>
                      {acc.isDefault ? (
                        <View style={styles.defaultPill}>
                          <Text style={styles.defaultPillText}>DEFAULT</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.menuDesc}>
                      {ACCOUNT_TYPE_LABELS[acc.type] || acc.type} • {formatCurrency(acc.balancePaise)}
                    </Text>
                  </View>
                  <View style={styles.itemActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleOpenEditAccount(acc)}
                    >
                      <Ionicons name="pencil" size={15} color={Colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => handleDeleteAccount(acc)}
                    >
                      <Ionicons name="trash-outline" size={15} color={Colors.expense} />
                    </TouchableOpacity>
                  </View>
                </View>
                {idx < accounts.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* 3. CATEGORIES MANAGEMENT */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>CATEGORIES</Text>
            <TouchableOpacity style={styles.addSmallBtn} onPress={handleOpenAddCategory}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addSmallBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Category Tabs */}
          <View style={styles.categoryPillsRow}>
            <TouchableOpacity
              style={[styles.catPill, categoryTab === 'expense' && styles.catPillActive]}
              onPress={() => setCategoryTab('expense')}
            >
              <Text
                style={[
                  styles.catPillText,
                  categoryTab === 'expense' && styles.catPillTextActive,
                ]}
              >
                Expense Categories
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.catPill, categoryTab === 'income' && styles.catPillActive]}
              onPress={() => setCategoryTab('income')}
            >
              <Text
                style={[
                  styles.catPillText,
                  categoryTab === 'income' && styles.catPillTextActive,
                ]}
              >
                Income Categories
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {filteredCategories.slice(0, 10).map((cat, idx) => (
              <React.Fragment key={cat.id}>
                <View style={styles.categoryRowItem}>
                  <View
                    style={[
                      styles.menuIconWrap,
                      { backgroundColor: cat.color ? `${cat.color}25` : '#27272A' },
                    ]}
                  >
                    <Ionicons
                      name={(cat.icon as any) || 'tag'}
                      size={18}
                      color={cat.color || Colors.primary}
                    />
                  </View>
                  <View style={styles.menuTextWrap}>
                    <Text style={styles.menuTitle}>{cat.name}</Text>
                    <Text style={styles.menuDesc}>
                      {cat.isSystem ? 'Default System Category' : 'Custom Category'}
                    </Text>
                  </View>
                  {!cat.isSystem && (
                    <View style={styles.itemActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleOpenEditCategory(cat)}
                      >
                        <Ionicons name="pencil" size={15} color={Colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleDeleteCategory(cat)}
                      >
                        <Ionicons name="trash-outline" size={15} color={Colors.expense} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                {idx < Math.min(filteredCategories.length, 10) - 1 && (
                  <View style={styles.divider} />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* 4. DAILY REMINDERS */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>DAILY NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: Colors.primary + '25' }]}>
                <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Daily Expense Reminder</Text>
                <Text style={styles.menuDesc}>Local prompt to record daily transactions</Text>
              </View>
              <Switch
                value={remindersEnabled}
                onValueChange={handleToggleReminders}
                trackColor={{ false: '#3F3F46', true: Colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            {remindersEnabled && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const { hour, minute } = parseTimeString(reminderTime);
                    setTempHour(hour);
                    setTempMinute(minute);
                    setShowTimeModal(true);
                  }}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: '#FBBF2425' }]}>
                    <Ionicons name="time-outline" size={20} color={Colors.warning} />
                  </View>
                  <View style={styles.menuTextWrap}>
                    <Text style={styles.menuTitle}>Reminder Time</Text>
                    <Text style={styles.menuDesc}>Delivered daily at {reminderTime}</Text>
                  </View>
                  <Text style={styles.infoValue}>{reminderTime}</Text>
                </TouchableOpacity>

                <View style={styles.divider} />
                <TouchableOpacity style={styles.menuItem} onPress={handleSendTestReminder}>
                  <View style={[styles.menuIconWrap, { backgroundColor: '#34D39925' }]}>
                    <Ionicons name="paper-plane-outline" size={20} color="#34D399" />
                  </View>
                  <View style={styles.menuTextWrap}>
                    <Text style={styles.menuTitle}>Send Test Notification</Text>
                    <Text style={styles.menuDesc}>Verify notifications appear on your device</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </>
            )}

            {!hasPermission && (
              <View style={styles.permissionWarning}>
                <Ionicons name="alert-circle" size={16} color={Colors.expense} />
                <Text style={styles.permissionWarningText}>
                  Android notification permission is disabled. Please enable notifications for MyFlow in Settings.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 5. DATA PORTABILITY & BACKUP */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>DATA MANAGEMENT & PORTABILITY</Text>
          <View style={styles.card}>
            {/* CSV Export */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleExportCSV}
              disabled={exportingCSV}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#4ADE8025' }]}>
                <Ionicons name="document-text-outline" size={20} color={Colors.income} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Export Transactions (CSV)</Text>
                <Text style={styles.menuDesc}>Export all transactions to spreadsheet format</Text>
              </View>
              {exportingCSV ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={18} color={Colors.textSecondary} />
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Full JSON Backup */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleExportBackup}
              disabled={exportingBackup}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: Colors.primary + '25' }]}>
                <Ionicons name="cloud-download-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Create Full Backup</Text>
                <Text style={styles.menuDesc}>Complete snapshot of accounts, loans & budgets</Text>
              </View>
              {exportingBackup ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={18} color={Colors.textSecondary} />
              )}
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Restore Backup */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handlePickBackupFile}
            >
              <View style={[styles.menuIconWrap, { backgroundColor: '#F9731625' }]}>
                <Ionicons name="cloud-upload-outline" size={20} color="#F97316" />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Restore from Backup</Text>
                <Text style={styles.menuDesc}>Import data from a previous MyFlow backup file</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 6. GENERAL & APP INFO */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>GENERAL & PRIVACY</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#FBBF2425' }]}>
                <Ionicons name="cash-outline" size={20} color={Colors.warning} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Currency</Text>
                <Text style={styles.menuDesc}>Indian Rupee (INR ₹)</Text>
              </View>
              <Text style={styles.infoValue}>₹ INR</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#A78BFA25' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#A78BFA" />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>Local-First Storage</Text>
                <Text style={styles.menuDesc}>SQLite on-device with zero tracking or cloud sync</Text>
              </View>
              <View style={styles.activePill}>
                <Text style={styles.activePillText}>Offline</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={[styles.menuIconWrap, { backgroundColor: '#3F3F46' }]}>
                <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
              </View>
              <View style={styles.menuTextWrap}>
                <Text style={styles.menuTitle}>MyFlow Application</Text>
                <Text style={styles.menuDesc}>Minimalist, production-ready personal finance</Text>
              </View>
              <Text style={styles.infoValue}>v1.0.0</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* MODAL: Time Picker Modal */}
      <Modal visible={showTimeModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Set Reminder Time</Text>
            <Text style={styles.modalSub}>Choose hour and minute for your daily notification</Text>

            <Text style={styles.inputLabel}>HOUR (00 - 23)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
              {Array.from({ length: 24 }).map((_, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.timeChip, tempHour === i && styles.timeChipActive]}
                  onPress={() => setTempHour(i)}
                >
                  <Text style={[styles.timeChipText, tempHour === i && styles.timeChipTextActive]}>
                    {String(i).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { marginTop: Spacing.md }]}>MINUTE</Text>
            <View style={styles.minuteRow}>
              {[0, 15, 30, 45].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.minuteChip, tempMinute === m && styles.timeChipActive]}
                  onPress={() => setTempMinute(m)}
                >
                  <Text style={[styles.timeChipText, tempMinute === m && styles.timeChipTextActive]}>
                    :{String(m).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTimeModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveReminderTime}>
                <Text style={styles.saveBtnText}>Save Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Add/Edit Account Modal */}
      <Modal visible={showAccountModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingAccount ? 'Edit Account' : 'Add New Account'}
            </Text>

            {accError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.expense} />
                <Text style={styles.errorBannerText}>{accError}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>ACCOUNT NAME</Text>
            <TextInput
              style={styles.textInput}
              value={accName}
              onChangeText={setAccName}
              placeholder="e.g. Salary Bank, Wallet"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.inputLabel}>ACCOUNT TYPE</Text>
            <View style={styles.typeSelectorRow}>
              {(['bank', 'upi', 'cash', 'credit', 'other'] as AccountType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeOption, accType === t && styles.typeOptionActive]}
                  onPress={() => setAccType(t)}
                >
                  <Text
                    style={[styles.typeOptionText, accType === t && styles.typeOptionTextActive]}
                  >
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!editingAccount && (
              <>
                <Text style={styles.inputLabel}>OPENING BALANCE (₹)</Text>
                <TextInput
                  style={styles.textInput}
                  value={accBalance}
                  onChangeText={setAccBalance}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="numeric"
                />
              </>
            )}

            <Text style={styles.inputLabel}>COLOR THEME</Text>
            <View style={styles.paletteRow}>
              {PALETTE.slice(0, 8).map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.paletteCircle, { backgroundColor: c }, accColor === c && styles.paletteSelected]}
                  onPress={() => setAccColor(c)}
                />
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAccountModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAccount}>
                <Text style={styles.saveBtnText}>{editingAccount ? 'Update' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Add/Edit Category Modal */}
      <Modal visible={showCategoryModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </Text>

            {catError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.expense} />
                <Text style={styles.errorBannerText}>{catError}</Text>
              </View>
            )}

            <Text style={styles.inputLabel}>CATEGORY NAME</Text>
            <TextInput
              style={styles.textInput}
              value={catName}
              onChangeText={setCatName}
              placeholder="e.g. Subscriptions, Pet Care"
              placeholderTextColor={Colors.textSecondary}
            />

            <Text style={styles.inputLabel}>CATEGORY TYPE</Text>
            <View style={styles.typeSelectorRow}>
              {(['expense', 'income'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeOption, catType === t && styles.typeOptionActive]}
                  onPress={() => setCatType(t)}
                >
                  <Text
                    style={[styles.typeOptionText, catType === t && styles.typeOptionTextActive]}
                  >
                    {t.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>COLOR THEME</Text>
            <View style={styles.paletteRow}>
              {PALETTE.slice(0, 8).map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.paletteCircle, { backgroundColor: c }, catColor === c && styles.paletteSelected]}
                  onPress={() => setCatColor(c)}
                />
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCategoryModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCategory}>
                <Text style={styles.saveBtnText}>{editingCategory ? 'Update' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Restore Backup Modal */}
      <Modal visible={showRestoreModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Restore MyFlow Backup</Text>
            <Text style={styles.modalSub}>
              Backup file verified: {restorePayload?.metadata.appName} v{restorePayload?.metadata.version}
            </Text>

            {restorePayload && (
              <View style={styles.backupStatsBox}>
                <Text style={styles.statsRow}>
                  • Transactions: {restorePayload.metadata.recordCounts.transactions}
                </Text>
                <Text style={styles.statsRow}>
                  • Accounts: {restorePayload.metadata.recordCounts.accounts}
                </Text>
                <Text style={styles.statsRow}>
                  • People & Loans: {restorePayload.metadata.recordCounts.persons} persons, {restorePayload.metadata.recordCounts.loans} loans
                </Text>
                <Text style={styles.statsRow}>
                  • Budgets: {restorePayload.metadata.recordCounts.budgets}
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>RESTORE MODE</Text>
            <View style={styles.restoreModeCol}>
              <TouchableOpacity
                style={[styles.restoreModeCard, restoreMode === 'replace' && styles.restoreModeActive]}
                onPress={() => setRestoreMode('replace')}
              >
                <Ionicons
                  name={restoreMode === 'replace' ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={restoreMode === 'replace' ? Colors.primary : Colors.textSecondary}
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.restoreModeTitle}>Replace Existing Data</Text>
                  <Text style={styles.restoreModeDesc}>
                    Replaces current records entirely with the contents of this backup file.
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.restoreModeCard, restoreMode === 'merge' && styles.restoreModeActive]}
                onPress={() => setRestoreMode('merge')}
              >
                <Ionicons
                  name={restoreMode === 'merge' ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={restoreMode === 'merge' ? Colors.primary : Colors.textSecondary}
                />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.restoreModeTitle}>Merge Data</Text>
                  <Text style={styles.restoreModeDesc}>
                    Keeps existing records and imports new non-duplicate items.
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowRestoreModal(false)}
                disabled={restoring}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, restoreMode === 'replace' && { backgroundColor: Colors.expense }]}
                onPress={handleConfirmRestore}
                disabled={restoring}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {restoreMode === 'replace' ? 'Replace & Restore' : 'Merge Data'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs + 2,
    paddingLeft: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.8,
  },
  addSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    gap: 2,
  },
  addSmallBtnText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  accountRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  categoryRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  menuTextWrap: {
    flex: 1,
  },
  nameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  menuDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  infoValue: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  defaultPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: Colors.primary + '25',
    borderRadius: Radius.sm,
  },
  defaultPillText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  activePill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    backgroundColor: Colors.income + '20',
    borderRadius: Radius.full,
  },
  activePillText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.income,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionBtn: {
    padding: 6,
    backgroundColor: '#27272A',
    borderRadius: Radius.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: 56,
  },
  categoryPillsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  catPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catPillActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  catPillText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  catPillTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  permissionWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.expense + '20',
    padding: Spacing.sm,
    margin: Spacing.md,
    borderRadius: Radius.sm,
    gap: Spacing.xs,
  },
  permissionWarningText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.expense,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modalSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: '#111113',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    marginBottom: Spacing.md,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Spacing.md,
  },
  typeOption: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#27272A',
  },
  typeOptionActive: {
    backgroundColor: Colors.primary,
  },
  typeOptionText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  typeOptionTextActive: {
    color: '#000000',
    fontWeight: FontWeight.bold,
  },
  paletteRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  paletteCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  paletteSelected: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  timeScroll: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: Radius.sm,
    marginRight: 6,
  },
  timeChipActive: {
    backgroundColor: Colors.primary,
  },
  timeChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  timeChipTextActive: {
    color: '#000000',
    fontWeight: FontWeight.bold,
  },
  minuteRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.lg,
  },
  minuteChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: Radius.sm,
  },
  backupStatsBox: {
    backgroundColor: '#161618',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statsRow: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  restoreModeCol: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  restoreModeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#161618',
    padding: Spacing.sm + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  restoreModeActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '10',
  },
  restoreModeTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  restoreModeDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.expense + '20',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  errorBannerText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.expense,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.md,
    backgroundColor: '#27272A',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: FontSize.sm,
    color: '#000000',
    fontWeight: FontWeight.bold,
  },
});
