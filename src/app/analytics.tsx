/**
 * Analytics Screen — MyFlow
 * Comprehensive financial analytics and reporting using real SQLite data:
 * - Income, expenses, and net cash flow
 * - Monthly income-versus-expense trends
 * - Category-wise spending breakdown with drill-down transaction inspection
 * - Daily spending trend and peak activity
 * - Largest expenses in period
 * - Account balance distribution
 * - Separate outstanding receivables and payables indicators
 * - Date range selection (Current Month, Previous Month, 6M, 12M, Custom)
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import {
  OverallAnalyticsSummary,
  AnalyticsDateRangePreset,
  CategorySpendingAnalysis,
  TransactionWithDetails,
} from '@/types';
import {
  getOverallAnalyticsSummary,
  getCategoryPeriodTransactions,
} from '@/db/analyticsRepository';
import { formatCurrency } from '@/utils/currency';
import { formatDate, relativeDateLabel, today } from '@/utils/date';
import { IncomeExpenseTrendChart } from '@/components/IncomeExpenseTrendChart';
import { CategoryBreakdownChart } from '@/components/CategoryBreakdownChart';
import { DailySpendingChart } from '@/components/DailySpendingChart';

export default function AnalyticsScreen() {
  const db = useSQLiteContext();

  const [preset, setPreset] = useState<AnalyticsDateRangePreset>('this_month');
  const [customStart, setCustomStart] = useState(today());
  const [customEnd, setCustomEnd] = useState(today());
  const [showCustomModal, setShowCustomModal] = useState(false);

  const [analytics, setAnalytics] = useState<OverallAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Category drill-down modal state
  const [selectedCategory, setSelectedCategory] = useState<CategorySpendingAnalysis | null>(null);
  const [categoryTransactions, setCategoryTransactions] = useState<TransactionWithDetails[]>([]);
  const [loadingCategoryTx, setLoadingCategoryTx] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getOverallAnalyticsSummary(db, preset, customStart, customEnd);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, preset, customStart, customEnd]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleSelectPreset = (newPreset: AnalyticsDateRangePreset) => {
    setPreset(newPreset);
    if (newPreset === 'custom') {
      setShowCustomModal(true);
    }
  };

  const handleApplyCustomRange = () => {
    setShowCustomModal(false);
    loadData();
  };

  const handleInspectCategory = async (cat: CategorySpendingAnalysis) => {
    if (!analytics) return;
    setSelectedCategory(cat);
    try {
      setLoadingCategoryTx(true);
      const txs = await getCategoryPeriodTransactions(
        db,
        cat.categoryId,
        analytics.startDate,
        analytics.endDate
      );
      setCategoryTransactions(txs);
    } catch (err) {
      console.error('Failed to inspect category transactions:', err);
    } finally {
      setLoadingCategoryTx(false);
    }
  };

  const closeCategoryModal = () => {
    setSelectedCategory(null);
    setCategoryTransactions([]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Financial Analytics</Text>
        <TouchableOpacity
          onPress={() => router.push('/budgets')}
          style={styles.budgetShortcutBtn}
        >
          <Ionicons name="pie-chart-outline" size={16} color={Colors.primary} />
          <Text style={styles.budgetShortcutText}>Budgets</Text>
        </TouchableOpacity>
      </View>

      {/* Date Range Selector Pills */}
      <View style={styles.presetBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
          {(
            [
              { id: 'this_month', label: 'Current Month' },
              { id: 'last_month', label: 'Previous Month' },
              { id: '6m', label: 'Last 6 Months' },
              { id: '12m', label: 'Last 12 Months' },
              { id: 'custom', label: 'Custom Range' },
            ] as const
          ).map((p) => {
            const isActive = preset === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.presetPill, isActive && styles.presetPillActive]}
                onPress={() => handleSelectPreset(p.id)}
              >
                <Text style={[styles.presetPillText, isActive && styles.presetPillTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading && !analytics ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Analyzing financial data...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
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
          {analytics && (
            <>
              {/* Period Info Subheader */}
              <View style={styles.periodBanner}>
                <Ionicons name="calendar" size={14} color={Colors.textSecondary} />
                <Text style={styles.periodBannerText}>
                  {analytics.periodLabel} ({formatDate(analytics.startDate)} – {formatDate(analytics.endDate)})
                </Text>
              </View>

              {/* Cashflow Summary Cards */}
              <View style={styles.summaryGrid}>
                {/* Total Income */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryCardTop}>
                    <View style={[styles.kpiIcon, { backgroundColor: 'rgba(74, 222, 128, 0.15)' }]}>
                      <Ionicons name="arrow-down-circle" size={16} color={Colors.income} />
                    </View>
                    <Text style={styles.summaryLabel}>Total Income</Text>
                  </View>
                  <Text style={[styles.summaryAmount, { color: Colors.income }]}>
                    {formatCurrency(analytics.totalIncomePaise)}
                  </Text>
                  <Text style={styles.summarySub}>Cash inflow</Text>
                </View>

                {/* Total Expenses */}
                <View style={styles.summaryCard}>
                  <View style={styles.summaryCardTop}>
                    <View style={[styles.kpiIcon, { backgroundColor: 'rgba(251, 113, 133, 0.15)' }]}>
                      <Ionicons name="arrow-up-circle" size={16} color={Colors.expense} />
                    </View>
                    <Text style={styles.summaryLabel}>Total Expenses</Text>
                  </View>
                  <Text style={[styles.summaryAmount, { color: Colors.expense }]}>
                    {formatCurrency(analytics.totalExpensePaise)}
                  </Text>
                  <Text style={styles.summarySub}>Cash outflow</Text>
                </View>
              </View>

              {/* Net Cash Flow Banner */}
              <View
                style={[
                  styles.netBanner,
                  analytics.netCashflowPaise >= 0 ? styles.netBannerPositive : styles.netBannerNegative,
                ]}
              >
                <View style={styles.netLeft}>
                  <Text style={styles.netLabel}>NET CASH FLOW</Text>
                  <Text
                    style={[
                      styles.netAmount,
                      { color: analytics.netCashflowPaise >= 0 ? Colors.income : Colors.expense },
                    ]}
                  >
                    {analytics.netCashflowPaise >= 0 ? '+' : '-'}
                    {formatCurrency(Math.abs(analytics.netCashflowPaise))}
                  </Text>
                </View>
                <View style={styles.netRight}>
                  <Text style={styles.netSubtext}>
                    {analytics.netCashflowPaise >= 0
                      ? 'Savings surplus in period'
                      : 'Expenses exceeded income'}
                  </Text>
                </View>
              </View>

              {/* Separate Lending / Borrowing Indicators */}
              <View style={styles.debtIndicatorsCard}>
                <View style={styles.debtHeader}>
                  <Ionicons name="people-outline" size={16} color={Colors.primary} />
                  <Text style={styles.debtTitle}>Outstanding Loans (Separate from Cash)</Text>
                </View>
                <View style={styles.debtRow}>
                  <View style={styles.debtBox}>
                    <Text style={styles.debtLabel}>OWED TO YOU</Text>
                    <Text style={[styles.debtValue, { color: Colors.income }]}>
                      {formatCurrency(analytics.outstandingReceivablesPaise)}
                    </Text>
                    <Text style={styles.debtSub}>Receivables</Text>
                  </View>
                  <View style={styles.debtDivider} />
                  <View style={styles.debtBox}>
                    <Text style={styles.debtLabel}>YOU OWE</Text>
                    <Text style={[styles.debtValue, { color: Colors.expense }]}>
                      {formatCurrency(analytics.outstandingPayablesPaise)}
                    </Text>
                    <Text style={styles.debtSub}>Payables</Text>
                  </View>
                </View>
              </View>

              {/* Monthly Income vs Expense Trend */}
              <Text style={styles.sectionHeaderTitle}>Income vs Expense Trend</Text>
              <IncomeExpenseTrendChart trends={analytics.incomeExpenseTrends} />

              {/* Category-Wise Spending Breakdown */}
              <Text style={styles.sectionHeaderTitle}>Category Analysis</Text>
              <CategoryBreakdownChart
                categories={analytics.categoryBreakdown}
                totalExpensePaise={analytics.totalExpensePaise}
                onSelectCategory={handleInspectCategory}
              />

              {/* Daily Spending Trend */}
              <Text style={styles.sectionHeaderTitle}>Daily Spending</Text>
              <DailySpendingChart trends={analytics.dailySpendingTrends} />

              {/* Largest Expenses in Period */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Largest Expenses in Period</Text>
                {analytics.largestExpenses.length > 0 ? (
                  analytics.largestExpenses.map((exp) => (
                    <View key={exp.id} style={styles.expenseItemRow}>
                      <View style={[styles.catIconWrap, { backgroundColor: `${exp.categoryColor}25` }]}>
                        <Ionicons name={(exp.categoryIcon || 'tag') as any} size={16} color={exp.categoryColor} />
                      </View>
                      <View style={styles.expenseInfo}>
                        <Text style={styles.expenseDesc} numberOfLines={1}>
                          {exp.description}
                        </Text>
                        <Text style={styles.expenseMeta}>
                          {exp.categoryName} • via {exp.accountName} • {formatDate(exp.date)}
                        </Text>
                      </View>
                      <Text style={styles.expenseAmount}>{formatCurrency(exp.amountPaise)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptyCardNote}>No expense transactions recorded in this period.</Text>
                )}
              </View>

              {/* Account Balance Distribution */}
              <View style={styles.card}>
                <View style={styles.accountHeaderRow}>
                  <Text style={styles.cardTitle}>Available Cash by Account</Text>
                  <Text style={styles.totalCashVal}>
                    Total: {formatCurrency(analytics.totalAvailableCashPaise)}
                  </Text>
                </View>
                <View style={styles.accountList}>
                  {analytics.accountBalances.map((acc) => (
                    <View key={acc.accountId} style={styles.accountRow}>
                      <View style={styles.accountLeft}>
                        <View style={[styles.accDot, { backgroundColor: acc.color }]} />
                        <Text style={styles.accountName}>{acc.accountName}</Text>
                        <Text style={styles.accountTypeBadge}>{acc.accountType}</Text>
                      </View>
                      <View style={styles.accountRight}>
                        <Text style={styles.accountBalance}>{formatCurrency(acc.balancePaise)}</Text>
                        <Text style={styles.accountPercent}>{acc.percentageOfTotal}%</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: Custom Date Range Picker */}
      {/* ──────────────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showCustomModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowCustomModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Custom Date Range</Text>
              <TouchableOpacity onPress={() => setShowCustomModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.formInput}
              value={customStart}
              onChangeText={setCustomStart}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textDisabled}
            />

            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.formInput}
              value={customEnd}
              onChangeText={setCustomEnd}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textDisabled}
            />

            <TouchableOpacity style={styles.applyBtn} onPress={handleApplyCustomRange}>
              <Text style={styles.applyBtnText}>Apply Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ──────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: Category Drill-Down Transactions */}
      {/* ──────────────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={selectedCategory !== null}
        animationType="slide"
        onRequestClose={closeCategoryModal}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom', 'left', 'right']}>
          {selectedCategory && (
            <View style={styles.drillContainer}>
              {/* Modal Header */}
              <View style={styles.drillHeader}>
                <TouchableOpacity onPress={closeCategoryModal} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <View style={styles.drillHeaderTitleWrap}>
                  <Text style={styles.drillHeaderTitle}>{selectedCategory.categoryName}</Text>
                  <Text style={styles.drillHeaderSub}>
                    {analytics?.periodLabel} • {formatCurrency(selectedCategory.totalSpentPaise)}
                  </Text>
                </View>
                <View style={{ width: 24 }} />
              </View>

              {/* Transactions List */}
              {loadingCategoryTx ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : (
                <FlatList
                  data={categoryTransactions}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.drillListContent}
                  renderItem={({ item }) => (
                    <View style={styles.drillItemRow}>
                      <View style={styles.drillItemLeft}>
                        <Text style={styles.drillItemDesc}>{item.description}</Text>
                        <Text style={styles.drillItemMeta}>
                          {item.accountName} • {relativeDateLabel(item.date)}
                          {item.note ? ` • ${item.note}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.drillItemAmount}>
                        -{formatCurrency(item.amountPaise)}
                      </Text>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View style={styles.emptyDrillBox}>
                      <Text style={styles.emptyCardNote}>No transactions found in this period.</Text>
                    </View>
                  }
                />
              )}
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backBtn: { padding: Spacing.xs },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  budgetShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  budgetShortcutText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  presetBar: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
  },
  presetScroll: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  presetPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetPillText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  presetPillTextActive: {
    color: '#000',
    fontWeight: FontWeight.bold,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    marginTop: Spacing.md,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },
  periodBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodBannerText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  kpiIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  summaryAmount: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginVertical: 2,
  },
  summarySub: {
    fontSize: 10,
    color: Colors.textDisabled,
    textTransform: 'uppercase',
  },
  netBanner: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netBannerPositive: {
    backgroundColor: '#13231B',
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  netBannerNegative: {
    backgroundColor: '#27171B',
    borderColor: 'rgba(251, 113, 133, 0.3)',
  },
  netLeft: { flex: 1 },
  netLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
  },
  netAmount: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },
  netRight: { alignItems: 'flex-end' },
  netSubtext: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    maxWidth: 120,
    textAlign: 'right',
  },
  debtIndicatorsCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debtHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  debtTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  debtRow: {
    flexDirection: 'row',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  debtBox: {
    flex: 1,
    alignItems: 'center',
  },
  debtLabel: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
  },
  debtValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    marginVertical: 2,
  },
  debtSub: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  debtDivider: {
    width: 1,
    height: '100%',
    backgroundColor: Colors.border,
  },
  sectionHeaderTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  expenseItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseInfo: { flex: 1 },
  expenseDesc: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  expenseMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.expense,
  },
  emptyCardNote: {
    color: Colors.textDisabled,
    fontSize: FontSize.xs,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  accountHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  totalCashVal: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  accountList: { gap: Spacing.sm },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  accountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  accountName: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
  },
  accountTypeBadge: {
    fontSize: 9,
    color: Colors.textDisabled,
    backgroundColor: '#27272A',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    textTransform: 'uppercase',
  },
  accountRight: { alignItems: 'flex-end' },
  accountBalance: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  accountPercent: {
    fontSize: 10,
    color: Colors.textDisabled,
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  sheetContent: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  formLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
  },
  applyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  applyBtnText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  /* Drill-down modal */
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  drillContainer: { flex: 1 },
  drillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  drillHeaderTitleWrap: { alignItems: 'center' },
  drillHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  drillHeaderSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  drillListContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
  },
  drillItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  drillItemLeft: { flex: 1 },
  drillItemDesc: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  drillItemMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  drillItemAmount: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.expense,
  },
  emptyDrillBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
});
