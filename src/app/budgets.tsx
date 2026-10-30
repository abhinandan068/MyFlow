/**
 * Monthly Budget Management Screen — MyFlow
 * Complete budget tracking and category spending control:
 * - Monthly overview (total budgeted, spent, remaining, overall percentage)
 * - Category budget progress bars with visual status (On track, Approaching limit, Exceeded)
 * - Month-by-month navigation
 * - Create, edit, and delete category budgets
 * - Over-budget indicators and remaining calculations
 * - Filtering by status (All, Exceeded, Approaching, On Track)
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import {
  BudgetWithDetails,
  MonthlyBudgetSummary,
  Category,
} from '@/types';
import {
  getMonthlyBudgetSummary,
  createBudget,
  updateBudget,
  deleteBudget,
} from '@/db/budgetsRepository';
import { getCategories } from '@/db/categoriesRepository';
import { formatCurrency, parseToPaise } from '@/utils/currency';
import { currentMonth, formatMonth, shiftMonth } from '@/utils/date';

type FilterTab = 'all' | 'exceeded' | 'approaching' | 'on_track';

export default function BudgetsScreen() {
  const db = useSQLiteContext();

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth());
  const [summary, setSummary] = useState<MonthlyBudgetSummary | null>(null);
  const [expenseCategories, setExpenseCategories] = useState<Category[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Add / Edit Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetWithDetails | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [limitInput, setLimitInput] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [budgetToDelete, setBudgetToDelete] = useState<BudgetWithDetails | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [sum, cats] = await Promise.all([
        getMonthlyBudgetSummary(db, selectedMonth),
        getCategories(db, 'expense'),
      ]);
      setSummary(sum);
      setExpenseCategories(cats);
    } catch (err) {
      console.error('Failed to load budgets:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, selectedMonth]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setSelectedMonth((prev) => shiftMonth(prev, -1));
  };

  const handleNextMonth = () => {
    setSelectedMonth((prev) => shiftMonth(prev, 1));
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(currentMonth());
  };

  // Open modal for new budget
  const handleOpenAddModal = () => {
    setEditingBudget(null);
    // Auto-select first available category without budget
    const existingCatIds = new Set((summary?.budgets ?? []).map((b) => b.categoryId));
    const available = expenseCategories.find((c) => !existingCatIds.has(c.id));
    setSelectedCategoryId(available ? available.id : expenseCategories[0]?.id ?? '');
    setLimitInput('');
    setModalError(null);
    setModalVisible(true);
  };

  // Open modal for editing budget
  const handleOpenEditModal = (budget: BudgetWithDetails) => {
    setEditingBudget(budget);
    setSelectedCategoryId(budget.categoryId);
    setLimitInput((budget.limitPaise / 100).toString());
    setModalError(null);
    setModalVisible(true);
  };

  // Submit budget form
  const handleSaveBudget = async () => {
    setModalError(null);
    if (!selectedCategoryId) {
      setModalError('Please select a category');
      return;
    }

    const paise = parseToPaise(limitInput);
    if (isNaN(paise) || paise <= 0) {
      setModalError('Please enter a positive budget amount');
      return;
    }

    setSubmitting(true);
    try {
      if (editingBudget) {
        await updateBudget(db, editingBudget.id, {
          categoryId: selectedCategoryId,
          limitPaise: paise,
          month: selectedMonth,
        });
      } else {
        await createBudget(db, {
          categoryId: selectedCategoryId,
          limitPaise: paise,
          month: selectedMonth,
        });
      }
      setModalVisible(false);
      loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save budget');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm and delete budget
  const confirmDelete = (budget: BudgetWithDetails) => {
    setBudgetToDelete(budget);
    setDeleteModalVisible(true);
  };

  const handleDeleteBudget = async () => {
    if (!budgetToDelete) return;
    try {
      await deleteBudget(db, budgetToDelete.id);
      setDeleteModalVisible(false);
      setBudgetToDelete(null);
      loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete budget');
    }
  };

  // Filter budgets
  const allBudgets = summary?.budgets ?? [];
  const filteredBudgets = allBudgets.filter((b) => {
    if (filterTab === 'exceeded') return b.isExceeded;
    if (filterTab === 'approaching') return b.isApproaching;
    if (filterTab === 'on_track') return !b.isExceeded && !b.isApproaching;
    return true;
  });

  const exceededCount = allBudgets.filter((b) => b.isExceeded).length;
  const approachingCount = allBudgets.filter((b) => b.isApproaching).length;
  const onTrackCount = allBudgets.filter((b) => !b.isExceeded && !b.isApproaching).length;

  const isCurrent = selectedMonth === currentMonth();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Monthly Budgets</Text>
          <Text style={styles.headerSubtitle}>Expense caps & tracking</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => router.push('/analytics')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="stats-chart" size={20} color={Colors.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addHeaderBtn}
            onPress={handleOpenAddModal}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month Navigation Bar */}
      <View style={styles.monthNav}>
        <TouchableOpacity
          style={styles.monthNavBtn}
          onPress={handlePrevMonth}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>

        <View style={styles.monthLabelContainer}>
          <Text style={styles.monthLabelText}>{formatMonth(selectedMonth)}</Text>
          {!isCurrent && (
            <TouchableOpacity onPress={handleCurrentMonth} style={styles.currentMonthBadge}>
              <Text style={styles.currentMonthBadgeText}>Back to Today</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.monthNavBtn}
          onPress={handleNextMonth}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Calculating budget limits & spending...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {/* Monthly Budget Summary Card */}
          {summary && summary.totalLimitPaise > 0 && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View>
                  <Text style={styles.summaryCardTitle}>Total Monthly Budget</Text>
                  <Text style={styles.summaryMonthSub}>{formatMonth(selectedMonth)}</Text>
                </View>
                <View
                  style={[
                    styles.summaryPercentBadge,
                    summary.totalSpentPaise > summary.totalLimitPaise
                      ? styles.badgeDanger
                      : summary.overallPercentage >= 80
                      ? styles.badgeWarning
                      : styles.badgeSuccess,
                  ]}
                >
                  <Text
                    style={[
                      styles.summaryPercentText,
                      summary.totalSpentPaise > summary.totalLimitPaise
                        ? styles.textDanger
                        : summary.overallPercentage >= 80
                        ? styles.textWarning
                        : styles.textSuccess,
                    ]}
                  >
                    {summary.overallPercentage}% Used
                  </Text>
                </View>
              </View>

              {/* Amount stats grid */}
              <View style={styles.summaryStatsRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>BUDGETED</Text>
                  <Text style={styles.statValue}>
                    {formatCurrency(summary.totalLimitPaise)}
                  </Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>TOTAL SPENT</Text>
                  <Text style={[styles.statValue, { color: Colors.expense }]}>
                    {formatCurrency(summary.totalSpentPaise)}
                  </Text>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>
                    {summary.totalRemainingPaise < 0 ? 'OVER BUDGET' : 'REMAINING'}
                  </Text>
                  <Text
                    style={[
                      styles.statValue,
                      {
                        color:
                          summary.totalRemainingPaise < 0
                            ? Colors.expense
                            : Colors.income,
                      },
                    ]}
                  >
                    {formatCurrency(Math.abs(summary.totalRemainingPaise))}
                  </Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, summary.overallPercentage)}%`,
                      backgroundColor:
                        summary.totalSpentPaise > summary.totalLimitPaise
                          ? Colors.expense
                          : summary.overallPercentage >= 80
                          ? Colors.warning
                          : Colors.primary,
                    },
                  ]}
                />
              </View>

              {/* Exceeded / status banner if applicable */}
              {summary.totalSpentPaise > summary.totalLimitPaise ? (
                <View style={styles.overBudgetBanner}>
                  <Ionicons name="alert-circle" size={16} color={Colors.expense} />
                  <Text style={styles.overBudgetText}>
                    Total monthly spending has exceeded the budget by{' '}
                    {formatCurrency(Math.abs(summary.totalRemainingPaise))}.
                  </Text>
                </View>
              ) : summary.overallPercentage >= 80 ? (
                <View style={styles.warningBanner}>
                  <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                  <Text style={styles.warningBannerText}>
                    Overall spending has reached {summary.overallPercentage}% of the monthly cap.
                  </Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Filter Chips Bar */}
          {allBudgets.length > 0 && (
            <View style={styles.filterTabsRow}>
              <TouchableOpacity
                style={[styles.filterChip, filterTab === 'all' && styles.filterChipActive]}
                onPress={() => setFilterTab('all')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterTab === 'all' && styles.filterChipTextActive,
                  ]}
                >
                  All ({allBudgets.length})
                </Text>
              </TouchableOpacity>

              {exceededCount > 0 && (
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    filterTab === 'exceeded' && styles.filterChipActiveDanger,
                  ]}
                  onPress={() => setFilterTab('exceeded')}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filterTab === 'exceeded' && styles.filterChipTextActiveDanger,
                    ]}
                  >
                    Exceeded ({exceededCount})
                  </Text>
                </TouchableOpacity>
              )}

              {approachingCount > 0 && (
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    filterTab === 'approaching' && styles.filterChipActiveWarning,
                  ]}
                  onPress={() => setFilterTab('approaching')}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filterTab === 'approaching' && styles.filterChipTextActiveWarning,
                    ]}
                  >
                    Near Limit ({approachingCount})
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.filterChip,
                  filterTab === 'on_track' && styles.filterChipActiveSuccess,
                ]}
                onPress={() => setFilterTab('on_track')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filterTab === 'on_track' && styles.filterChipTextActiveSuccess,
                  ]}
                >
                  On Track ({onTrackCount})
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Budgets List */}
          {filteredBudgets.length > 0 ? (
            <View style={styles.budgetsSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeading}>Category Budgets</Text>
                <Text style={styles.sectionSubHeading}>
                  {filteredBudgets.length} {filteredBudgets.length === 1 ? 'category' : 'categories'}
                </Text>
              </View>

              {filteredBudgets.map((item) => (
                <View key={item.id} style={styles.budgetItemCard}>
                  {/* Top line: Icon, Name, Amounts */}
                  <View style={styles.budgetItemTop}>
                    <View style={styles.categoryInfoCol}>
                      <View
                        style={[
                          styles.catIconWrap,
                          { backgroundColor: item.categoryColor + '25' },
                        ]}
                      >
                        <Ionicons
                          name={(item.categoryIcon as any) || 'pricetag'}
                          size={18}
                          color={item.categoryColor || Colors.primary}
                        />
                      </View>
                      <View style={styles.catNameWrap}>
                        <Text style={styles.catNameText}>{item.categoryName}</Text>
                        <Text style={styles.catTxCount}>
                          {item.transactionCount}{' '}
                          {item.transactionCount === 1 ? 'expense' : 'expenses'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.amountInfoCol}>
                      <Text style={styles.spentAmountText}>
                        {formatCurrency(item.spentPaise)}
                      </Text>
                      <Text style={styles.limitAmountText}>
                        of {formatCurrency(item.limitPaise)}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={styles.budgetProgressBg}>
                    <View
                      style={[
                        styles.budgetProgressFill,
                        {
                          width: `${Math.min(100, item.percentageUsed)}%`,
                          backgroundColor: item.isExceeded
                            ? Colors.expense
                            : item.isApproaching
                            ? Colors.warning
                            : Colors.primary,
                        },
                      ]}
                    />
                  </View>

                  {/* Status Banner and Action buttons */}
                  <View style={styles.budgetFooterRow}>
                    <View style={styles.budgetBadgeWrap}>
                      {item.isExceeded ? (
                        <View style={styles.statusBadgeDanger}>
                          <Ionicons name="warning" size={13} color={Colors.expense} />
                          <Text style={styles.statusBadgeDangerText}>
                            Over by {formatCurrency(Math.abs(item.remainingPaise))} (
                            {item.percentageUsed}%)
                          </Text>
                        </View>
                      ) : item.isApproaching ? (
                        <View style={styles.statusBadgeWarning}>
                          <Ionicons name="alert-circle-outline" size={13} color={Colors.warning} />
                          <Text style={styles.statusBadgeWarningText}>
                            {item.percentageUsed}% used • {formatCurrency(item.remainingPaise)} left
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.statusBadgeSuccess}>
                          <Ionicons name="checkmark-circle-outline" size={13} color={Colors.income} />
                          <Text style={styles.statusBadgeSuccessText}>
                            {formatCurrency(item.remainingPaise)} remaining ({item.percentageUsed}%)
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Actions: Edit & Delete */}
                    <View style={styles.budgetActions}>
                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => handleOpenEditModal(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="pencil" size={16} color={Colors.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionIconBtn}
                        onPress={() => confirmDelete(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={Colors.expense} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : allBudgets.length > 0 ? (
            <View style={styles.emptyFilteredState}>
              <Ionicons name="filter" size={36} color={Colors.textSecondary} />
              <Text style={styles.emptyFilteredTitle}>No budgets in this filter</Text>
              <Text style={styles.emptyFilteredDesc}>
                Try selecting "All" to view all configured category budgets.
              </Text>
            </View>
          ) : (
            /* Complete Empty State */
            <View style={styles.emptyStateCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="wallet-outline" size={44} color={Colors.primary} />
              </View>
              <Text style={styles.emptyStateTitle}>No Budgets for {formatMonth(selectedMonth)}</Text>
              <Text style={styles.emptyStateDesc}>
                Set spending limits for categories like Groceries, Shopping, or Dining out to avoid overspending and grow your savings.
              </Text>
              <TouchableOpacity style={styles.createBudgetCTA} onPress={handleOpenAddModal}>
                <Ionicons name="add" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.createBudgetCTAText}>Create Monthly Budget</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Add / Edit Budget Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingBudget ? 'Edit Budget' : 'New Category Budget'}
              </Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTargetMonth}>
              Active for: <Text style={{ color: Colors.primary }}>{formatMonth(selectedMonth)}</Text>
            </Text>

            {modalError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={16} color={Colors.expense} />
                <Text style={styles.errorBannerText}>{modalError}</Text>
              </View>
            )}

            {/* Category selection */}
            <Text style={styles.inputLabel}>SELECT EXPENSE CATEGORY</Text>
            <ScrollView
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryScrollContent}
              nestedScrollEnabled
            >
              {expenseCategories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                const existingBudget = (summary?.budgets ?? []).find(
                  (b) => b.categoryId === cat.id && b.id !== editingBudget?.id
                );

                return (
                  <TouchableOpacity
                    key={cat.id}
                    disabled={!!existingBudget}
                    style={[
                      styles.categoryOption,
                      isSelected && styles.categoryOptionSelected,
                      existingBudget && styles.categoryOptionDisabled,
                    ]}
                    onPress={() => setSelectedCategoryId(cat.id)}
                  >
                    <View
                      style={[
                        styles.catOptionIcon,
                        { backgroundColor: cat.color ? cat.color + '25' : '#333' },
                      ]}
                    >
                      <Ionicons
                        name={(cat.icon as any) || 'pricetag'}
                        size={16}
                        color={cat.color || Colors.primary}
                      />
                    </View>
                    <Text
                      style={[
                        styles.catOptionName,
                        isSelected && styles.catOptionNameSelected,
                        existingBudget && styles.catOptionNameDisabled,
                      ]}
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                    {existingBudget ? (
                      <Text style={styles.catAlreadySetBadge}>Already Set</Text>
                    ) : isSelected ? (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Monthly Limit Input */}
            <Text style={styles.inputLabel}>MONTHLY LIMIT (₹)</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.rupeePrefix}>₹</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="5,000"
                placeholderTextColor={Colors.textSecondary}
                value={limitInput}
                onChangeText={setLimitInput}
              />
            </View>

            {/* Quick preset amount chips */}
            <View style={styles.quickChipsRow}>
              {[2000, 5000, 10000, 20000, 50000].map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={styles.quickChip}
                  onPress={() => setLimitInput(amt.toString())}
                >
                  <Text style={styles.quickChipText}>
                    ₹{amt >= 1000 ? `${amt / 1000}k` : amt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Action buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveBudget}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {editingBudget ? 'Update Budget' : 'Create Budget'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteModalContainer}>
            <View style={styles.deleteIconWrap}>
              <Ionicons name="trash-outline" size={32} color={Colors.expense} />
            </View>
            <Text style={styles.deleteTitle}>Delete Budget?</Text>
            <Text style={styles.deleteDesc}>
              Are you sure you want to delete the monthly budget for{' '}
              <Text style={{ color: Colors.textPrimary, fontWeight: FontWeight.bold }}>
                {budgetToDelete?.categoryName}
              </Text>
              ? Your historical transactions and actual spending will not be affected.
            </Text>

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setDeleteModalVisible(false)}
              >
                <Text style={styles.deleteCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteConfirmBtn}
                onPress={handleDeleteBudget}
              >
                <Text style={styles.deleteConfirmBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerActionBtn: {
    padding: Spacing.xs,
    backgroundColor: Colors.card,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addHeaderBtn: {
    backgroundColor: Colors.primary,
    padding: 6,
    borderRadius: Radius.full,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  monthNavBtn: {
    padding: Spacing.xs,
  },
  monthLabelContainer: {
    alignItems: 'center',
  },
  monthLabelText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  currentMonthBadge: {
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.primary + '20',
    borderRadius: Radius.sm,
  },
  currentMonthBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
  },
  summaryCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  summaryCardTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  summaryMonthSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  summaryPercentBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  summaryPercentText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  badgeSuccess: {
    backgroundColor: Colors.income + '20',
  },
  textSuccess: {
    color: Colors.income,
  },
  badgeWarning: {
    backgroundColor: Colors.warning + '20',
  },
  textWarning: {
    color: Colors.warning,
  },
  badgeDanger: {
    backgroundColor: Colors.expense + '20',
  },
  textDanger: {
    color: Colors.expense,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#27272A',
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  overBudgetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.expense + '15',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  overBudgetText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.expense,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning + '15',
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  warningBannerText: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.warning,
  },
  filterTabsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  filterChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary + '20',
    borderColor: Colors.primary,
  },
  filterChipActiveDanger: {
    backgroundColor: Colors.expense + '20',
    borderColor: Colors.expense,
  },
  filterChipActiveWarning: {
    backgroundColor: Colors.warning + '20',
    borderColor: Colors.warning,
  },
  filterChipActiveSuccess: {
    backgroundColor: Colors.income + '20',
    borderColor: Colors.income,
  },
  filterChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  filterChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  filterChipTextActiveDanger: {
    color: Colors.expense,
    fontWeight: FontWeight.bold,
  },
  filterChipTextActiveWarning: {
    color: Colors.warning,
    fontWeight: FontWeight.bold,
  },
  filterChipTextActiveSuccess: {
    color: Colors.income,
    fontWeight: FontWeight.bold,
  },
  budgetsSection: {
    gap: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubHeading: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  budgetItemCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  budgetItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  categoryInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  catIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  catNameWrap: {
    flex: 1,
  },
  catNameText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  catTxCount: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  amountInfoCol: {
    alignItems: 'flex-end',
  },
  spentAmountText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  limitAmountText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  budgetProgressBg: {
    height: 6,
    backgroundColor: '#27272A',
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  budgetProgressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  budgetFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetBadgeWrap: {
    flex: 1,
  },
  statusBadgeDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadgeDangerText: {
    fontSize: 11,
    color: Colors.expense,
    fontWeight: FontWeight.semibold,
  },
  statusBadgeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadgeWarningText: {
    fontSize: 11,
    color: Colors.warning,
    fontWeight: FontWeight.semibold,
  },
  statusBadgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusBadgeSuccessText: {
    fontSize: 11,
    color: Colors.income,
    fontWeight: FontWeight.semibold,
  },
  budgetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionIconBtn: {
    padding: 6,
    borderRadius: Radius.sm,
    backgroundColor: '#27272A',
  },
  emptyFilteredState: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginVertical: Spacing.md,
  },
  emptyFilteredTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  emptyFilteredDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyStateCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.md,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emptyStateTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptyStateDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  createBudgetCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.md,
  },
  createBudgetCTAText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
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
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalTargetMonth: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
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
  inputLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  categoryScroll: {
    maxHeight: 160,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    backgroundColor: '#161618',
  },
  categoryScrollContent: {
    padding: 6,
    gap: 4,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: Radius.sm,
  },
  categoryOptionSelected: {
    backgroundColor: Colors.primary + '20',
  },
  categoryOptionDisabled: {
    opacity: 0.45,
  },
  catOptionIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  catOptionName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
  },
  catOptionNameSelected: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  catOptionNameDisabled: {
    color: Colors.textSecondary,
  },
  catAlreadySetBadge: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    marginBottom: Spacing.sm,
  },
  rupeePrefix: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },
  amountInput: {
    flex: 1,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  quickChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: '#27272A',
    borderRadius: Radius.full,
  },
  quickChipText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
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
    flex: 2,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: FontSize.sm,
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  deleteModalContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  deleteIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.expense + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  deleteTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  deleteDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  deleteCancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.md,
    backgroundColor: '#27272A',
    alignItems: 'center',
  },
  deleteCancelBtnText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.expense,
    alignItems: 'center',
  },
  deleteConfirmBtnText: {
    fontSize: FontSize.sm,
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
});
