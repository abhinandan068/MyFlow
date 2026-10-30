/**
 * Home Dashboard screen — MyFlow
 * Displays real-time database figures:
 * - Combined available balance across active accounts
 * - Current month's income & expenses (excluding transfers)
 * - Individual account balance cards
 * - Recent transactions, newest first
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { DashboardSummary } from '@/types';
import { getDashboardSummary } from '@/db/dashboardRepository';
import { getSetting, setSetting } from '@/db/settingsRepository';
import { scheduleDailyReminder, requestNotificationPermission } from '@/services/notifications';
import { formatCurrency } from '@/utils/currency';
import { relativeDateLabel, currentMonth, formatMonth, formatHeaderDate } from '@/utils/date';

export default function HomeScreen() {
  const db = useSQLiteContext();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showReminderBanner, setShowReminderBanner] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [data, onboardingDone] = await Promise.all([
        getDashboardSummary(db, currentMonth(), 6),
        getSetting(db, 'reminder_onboarding_completed', 'false'),
      ]);
      setSummary(data);
      setShowReminderBanner(onboardingDone !== 'true');
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db]);

  const handleEnableReminder = async () => {
    const perm = await requestNotificationPermission();
    if (perm.granted) {
      await scheduleDailyReminder(21, 0, db);
    }
    await setSetting(db, 'reminder_onboarding_completed', 'true');
    setShowReminderBanner(false);
  };

  const handleDismissReminder = async () => {
    await setSetting(db, 'reminder_onboarding_completed', 'true');
    setShowReminderBanner(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading && !summary) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading finances...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const netMonthPaise =
    (summary?.monthlyIncomePaise ?? 0) - (summary?.monthlyExpensePaise ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>MyFlow</Text>
            <Text style={styles.headerDate}>
              {formatHeaderDate()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.quickAddButton}
            onPress={() => router.navigate('/(tabs)/add')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.quickAddText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Daily Reminder Setup Onboarding Banner */}
        {showReminderBanner && (
          <View style={styles.reminderBannerCard}>
            <View style={styles.reminderBannerIconWrap}>
              <Ionicons name="notifications" size={20} color={Colors.primary} />
            </View>
            <View style={styles.reminderBannerTextWrap}>
              <Text style={styles.reminderBannerTitle}>Daily Expense Check-in</Text>
              <Text style={styles.reminderBannerDesc}>
                Set a 9:00 PM reminder to log purchases and keep your budget up to date.
              </Text>
              <View style={styles.reminderBannerActionRow}>
                <TouchableOpacity
                  style={styles.reminderEnableBtn}
                  onPress={handleEnableReminder}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reminderEnableBtnText}>Turn On</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reminderDismissBtn}
                  onPress={handleDismissReminder}
                  activeOpacity={0.8}
                >
                  <Text style={styles.reminderDismissBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Total Available Balance Card */}
        <View style={styles.totalCard}>
          <Text style={styles.cardSuperLabel}>Total Available Funds</Text>
          <Text style={styles.totalAmount}>
            {formatCurrency(summary?.totalBalancePaise ?? 0)}
          </Text>

          {/* Month Cashflow Pills */}
          <View style={styles.cashflowRow}>
            <View style={styles.cashflowItem}>
              <View style={styles.cashflowHeader}>
                <Ionicons name="arrow-up-circle" size={16} color={Colors.income} />
                <Text style={styles.cashflowLabel}>Income</Text>
              </View>
              <Text style={[styles.cashflowAmount, { color: Colors.income }]}>
                {formatCurrency(summary?.monthlyIncomePaise ?? 0)}
              </Text>
            </View>

            <View style={styles.cashflowDivider} />

            <View style={styles.cashflowItem}>
              <View style={styles.cashflowHeader}>
                <Ionicons
                  name="arrow-down-circle"
                  size={16}
                  color={Colors.expense}
                />
                <Text style={styles.cashflowLabel}>Expenses</Text>
              </View>
              <Text style={[styles.cashflowAmount, { color: Colors.expense }]}>
                {formatCurrency(summary?.monthlyExpensePaise ?? 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Lending & Debt Summary Cards (Receivables & Payables) */}
        <View style={styles.lendingRow}>
          <TouchableOpacity
            style={[styles.lendingCard, styles.lendingCardLent]}
            onPress={() => router.navigate('/(tabs)/people?tab=lent')}
            activeOpacity={0.8}
          >
            <View style={styles.lendingHeader}>
              <View style={[styles.lendingIconBadge, { backgroundColor: 'rgba(74, 222, 128, 0.15)' }]}>
                <Ionicons name="arrow-down-circle" size={16} color={Colors.income} />
              </View>
              <Text style={styles.lendingLabel}>Owed to You</Text>
            </View>
            <Text style={[styles.lendingAmount, { color: Colors.income }]}>
              {formatCurrency(summary?.totalOwedToYouPaise ?? 0)}
            </Text>
            <Text style={styles.lendingSub}>Receivables</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.lendingCard, styles.lendingCardBorrowed]}
            onPress={() => router.navigate('/(tabs)/people?tab=borrowed')}
            activeOpacity={0.8}
          >
            <View style={styles.lendingHeader}>
              <View style={[styles.lendingIconBadge, { backgroundColor: 'rgba(251, 113, 133, 0.15)' }]}>
                <Ionicons name="arrow-up-circle" size={16} color={Colors.expense} />
              </View>
              <Text style={styles.lendingLabel}>You Owe</Text>
            </View>
            <Text style={[styles.lendingAmount, { color: Colors.expense }]}>
              {formatCurrency(summary?.totalYouOwePaise ?? 0)}
            </Text>
            <Text style={styles.lendingSub}>Payables</Text>
          </TouchableOpacity>
        </View>

        {/* Financial Insights & Tools Navigation */}
        <View style={styles.toolsRow}>
          <TouchableOpacity
            style={styles.toolCard}
            onPress={() => router.push('/analytics')}
            activeOpacity={0.8}
          >
            <View style={[styles.toolIconBadge, { backgroundColor: Colors.primary + '20' }]}>
              <Ionicons name="stats-chart" size={18} color={Colors.primary} />
            </View>
            <View style={styles.toolTextCol}>
              <Text style={styles.toolTitle}>Analytics</Text>
              <Text style={styles.toolSub}>Trends & breakdown</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolCard}
            onPress={() => router.push('/budgets')}
            activeOpacity={0.8}
          >
            <View style={[styles.toolIconBadge, { backgroundColor: '#38BDF820' }]}>
              <Ionicons name="wallet-outline" size={18} color="#38BDF8" />
            </View>
            <View style={styles.toolTextCol}>
              <Text style={styles.toolTitle}>Budgets</Text>
              <Text style={styles.toolSub}>Monthly limits</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Accounts Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Accounts</Text>
            <Text style={styles.sectionCount}>
              {summary?.accounts.length ?? 0} active
            </Text>
          </View>

          {summary?.accounts && summary.accounts.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.accountsScroll}
            >
              {summary.accounts.map((acc) => (
                <View key={acc.id} style={styles.accountCard}>
                  <View style={styles.accountTop}>
                    <View
                      style={[
                        styles.accountIconBadge,
                        { backgroundColor: `${acc.color}25` },
                      ]}
                    >
                      <Ionicons
                        name={acc.icon as any}
                        size={18}
                        color={acc.color}
                      />
                    </View>
                    {acc.isDefault ? (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {acc.name}
                  </Text>
                  <Text style={styles.accountType}>
                    {acc.type.toUpperCase()}
                  </Text>
                  <Text style={styles.accountBalance}>
                    {formatCurrency(acc.balancePaise)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="wallet-outline" size={32} color={Colors.textDisabled} />
              <Text style={styles.emptyText}>No accounts configured.</Text>
            </View>
          )}
        </View>

        {/* Recent Transactions Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity
              onPress={() => router.navigate('/(tabs)/history')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>

          {summary?.recentTransactions &&
          summary.recentTransactions.length > 0 ? (
            <View style={styles.transactionsList}>
              {summary.recentTransactions.map((tx) => {
                const isExpense = tx.type === 'expense';
                const isIncome = tx.type === 'income';
                const isTransfer = tx.type === 'transfer';

                const amountColor = isIncome
                  ? Colors.income
                  : isExpense
                  ? Colors.expense
                  : Colors.transfer;

                const sign = isIncome ? '+' : isExpense ? '-' : '';
                const iconName = isTransfer
                  ? 'swap-horizontal'
                  : (tx.categoryIcon as any) || 'cash-outline';

                const badgeBg = isTransfer
                  ? `${Colors.transfer}25`
                  : `${tx.categoryColor || Colors.primary}25`;

                const iconColor = isTransfer
                  ? Colors.transfer
                  : tx.categoryColor || Colors.primary;

                return (
                  <View key={tx.id} style={styles.transactionItem}>
                    <View
                      style={[styles.txIconBadge, { backgroundColor: badgeBg }]}
                    >
                      <Ionicons name={iconName} size={20} color={iconColor} />
                    </View>

                    <View style={styles.txDetails}>
                      <Text style={styles.txTitle} numberOfLines={1}>
                        {tx.description}
                      </Text>
                      <Text style={styles.txSubtitle} numberOfLines={1}>
                        {isTransfer
                          ? `${tx.accountName} → ${tx.toAccountName ?? 'Account'}`
                          : `${tx.categoryName ?? 'General'} • ${tx.accountName}`}
                      </Text>
                    </View>

                    <View style={styles.txAmountContainer}>
                      <Text style={[styles.txAmount, { color: amountColor }]}>
                        {sign}
                        {formatCurrency(tx.amountPaise)}
                      </Text>
                      <Text style={styles.txDate}>
                        {relativeDateLabel(tx.date)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons
                name="receipt-outline"
                size={36}
                color={Colors.textDisabled}
              />
              <Text style={styles.emptyTitle}>No Transactions Yet</Text>
              <Text style={styles.emptyText}>
                Tap the + button below to log your first income, expense, or
                transfer.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1 },
  contentContainer: { padding: Spacing.lg, paddingBottom: 80 },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    marginTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerDate: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: 4,
  },
  quickAddText: {
    color: '#000',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  totalCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  cardSuperLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalAmount: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginVertical: Spacing.sm,
  },
  cashflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cashflowItem: {
    flex: 1,
    alignItems: 'center',
  },
  cashflowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cashflowLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  cashflowAmount: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  cashflowDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  lendingRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  lendingCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lendingCardLent: {
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  lendingCardBorrowed: {
    borderColor: 'rgba(251, 113, 133, 0.3)',
  },
  lendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  lendingIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lendingLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  lendingAmount: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    marginVertical: 2,
  },
  lendingSub: {
    fontSize: 10,
    color: Colors.textDisabled,
    textTransform: 'uppercase',
  },
  toolsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  toolCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.sm + 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toolIconBadge: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  toolTextCol: {
    flex: 1,
  },
  toolTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  toolSub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  sectionCount: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  seeAllText: {
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  accountsScroll: {
    gap: Spacing.md,
    paddingRight: Spacing.md,
  },
  accountCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    width: 140,
  },
  accountTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  accountIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultBadge: {
    backgroundColor: '#27272A',
    borderRadius: Radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: 9,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  accountName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  accountType: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  accountBalance: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  transactionsList: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  txIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  txDetails: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  txTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  txSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  txDate: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  reminderBannerCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
  },
  reminderBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm + 2,
  },
  reminderBannerTextWrap: {
    flex: 1,
  },
  reminderBannerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  reminderBannerDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  reminderBannerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  reminderEnableBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  reminderEnableBtnText: {
    fontSize: FontSize.xs,
    color: '#000000',
    fontWeight: FontWeight.bold,
  },
  reminderDismissBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
  },
  reminderDismissBtnText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
});
