/**
 * History Screen — MyFlow
 * Displays complete transaction ledger with FlatList:
 * - Newest-first ordering
 * - Live search by description, category, and notes
 * - Filter by All, Expenses, Income, Transfers
 * - Transaction detail modal with safe edit and delete actions
 * - Confirmation dialog before deletion with automated balance reversal
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { TransactionWithDetails, TransactionType } from '@/types';
import {
  getTransactions,
  deleteTransaction,
  updateTransaction,
} from '@/db/transactionsRepository';
import { formatCurrency, parseToPaise } from '@/utils/currency';
import { relativeDateLabel, formatDate } from '@/utils/date';

type FilterType = 'all' | 'expense' | 'income' | 'transfer';

export default function HistoryScreen() {
  const db = useSQLiteContext();

  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('all');

  // Detail & Edit Modal State
  const [selectedTx, setSelectedTx] = useState<TransactionWithDetails | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const loadTransactions = useCallback(async () => {
    try {
      const filter: any = {};
      if (selectedFilter !== 'all') {
        filter.type = selectedFilter as TransactionType;
      }
      if (search.trim()) {
        filter.search = search.trim();
      }

      const list = await getTransactions(db, filter);
      setTransactions(list);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, selectedFilter, search]);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [loadTransactions])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTransactions();
  }, [loadTransactions]);

  const openDetail = (tx: TransactionWithDetails) => {
    setSelectedTx(tx);
    setIsEditing(false);
    setEditDescription(tx.description);
    setEditAmountStr((tx.amountPaise / 100).toFixed(2));
    setEditNote(tx.note || '');
    setEditError(null);
  };

  const closeDetail = () => {
    setSelectedTx(null);
    setIsEditing(false);
    setEditError(null);
  };

  const handleDelete = () => {
    if (!selectedTx) return;

    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This will reverse its financial effect on your account balance.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(db, selectedTx.id);
              closeDetail();
              loadTransactions();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete transaction');
            }
          },
        },
      ]
    );
  };

  const handleSaveEdit = async () => {
    if (!selectedTx) return;
    setEditError(null);

    const paise = parseToPaise(editAmountStr);
    if (isNaN(paise) || paise <= 0) {
      setEditError('Please enter a valid amount greater than ₹0.00');
      return;
    }

    if (!editDescription.trim()) {
      setEditError('Description cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    try {
      const updated = await updateTransaction(db, selectedTx.id, {
        type: selectedTx.type,
        amountPaise: paise,
        accountId: selectedTx.accountId,
        toAccountId: selectedTx.toAccountId,
        categoryId: selectedTx.categoryId,
        description: editDescription.trim(),
        note: editNote.trim() || null,
        date: selectedTx.date,
      });

      setSelectedTx(updated);
      setIsEditing(false);
      loadTransactions();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update transaction');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const renderTransaction = ({ item }: { item: TransactionWithDetails }) => {
    const isExpense = item.type === 'expense';
    const isIncome = item.type === 'income';
    const isTransfer = item.type === 'transfer';

    const amountColor = isIncome
      ? Colors.income
      : isExpense
      ? Colors.expense
      : Colors.transfer;

    const sign = isIncome ? '+' : isExpense ? '-' : '';
    const iconName = isTransfer
      ? 'swap-horizontal'
      : (item.categoryIcon as any) || 'cash-outline';

    const badgeBg = isTransfer
      ? `${Colors.transfer}25`
      : `${item.categoryColor || Colors.primary}25`;

    const iconColor = isTransfer
      ? Colors.transfer
      : item.categoryColor || Colors.primary;

    return (
      <TouchableOpacity
        style={styles.txRow}
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.txIconBadge, { backgroundColor: badgeBg }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>

        <View style={styles.txInfo}>
          <Text style={styles.txDescription} numberOfLines={1}>
            {item.description}
          </Text>
          <Text style={styles.txMeta} numberOfLines={1}>
            {isTransfer
              ? `${item.accountName} → ${item.toAccountName ?? 'Account'}`
              : `${item.categoryName ?? 'General'} • ${item.accountName}`}
          </Text>
        </View>

        <View style={styles.txTrailing}>
          <Text style={[styles.txAmount, { color: amountColor }]}>
            {sign}
            {formatCurrency(item.amountPaise)}
          </Text>
          <Text style={styles.txDate}>{relativeDateLabel(item.date)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Top Bar */}
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.navigate('/(tabs)/add')}
        >
          <Ionicons name="add" size={20} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by title, category, or note..."
          placeholderTextColor={Colors.textDisabled}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        {(['all', 'expense', 'income', 'transfer'] as FilterType[]).map((f) => {
          const isSelected = selectedFilter === f;
          const label =
            f === 'all'
              ? 'All'
              : f === 'expense'
              ? 'Expenses'
              : f === 'income'
              ? 'Income'
              : 'Transfers';

          return (
            <TouchableOpacity
              key={f}
              style={[
                styles.filterChip,
                isSelected && styles.filterChipSelected,
              ]}
              onPress={() => setSelectedFilter(f)}
            >
              <Text
                style={[
                  styles.filterText,
                  isSelected && styles.filterTextSelected,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Transactions List */}
      {loading && transactions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons
                name="receipt-outline"
                size={48}
                color={Colors.textDisabled}
              />
              <Text style={styles.emptyTitle}>No Transactions Found</Text>
              <Text style={styles.emptySubtitle}>
                {search.length > 0 || selectedFilter !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Start by tapping the + button to add a transaction.'}
              </Text>
            </View>
          }
        />
      )}

      {/* Transaction Detail & Edit Modal */}
      <Modal
        visible={selectedTx !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={closeDetail}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalContent}>
            {selectedTx ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {isEditing ? 'Edit Transaction' : 'Transaction Details'}
                  </Text>
                  <TouchableOpacity onPress={closeDetail} style={styles.modalClose}>
                    <Ionicons name="close" size={24} color={Colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {editError ? (
                  <View style={styles.modalError}>
                    <Ionicons name="alert-circle" size={18} color={Colors.expense} />
                    <Text style={styles.modalErrorText}>{editError}</Text>
                  </View>
                ) : null}

                {isEditing ? (
                  /* Edit Form */
                  <View style={styles.editForm}>
                    <Text style={styles.fieldLabel}>Amount</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editAmountStr}
                      onChangeText={setEditAmountStr}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.textDisabled}
                    />

                    <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
                      Description
                    </Text>
                    <TextInput
                      style={styles.editInput}
                      value={editDescription}
                      onChangeText={setEditDescription}
                      placeholder="Description"
                      placeholderTextColor={Colors.textDisabled}
                    />

                    <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
                      Notes (Optional)
                    </Text>
                    <TextInput
                      style={[styles.editInput, { minHeight: 60 }]}
                      value={editNote}
                      onChangeText={setEditNote}
                      placeholder="Extra notes"
                      placeholderTextColor={Colors.textDisabled}
                      multiline
                    />

                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={styles.cancelEditButton}
                        onPress={() => setIsEditing(false)}
                      >
                        <Text style={styles.cancelEditText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.saveEditButton}
                        onPress={handleSaveEdit}
                        disabled={isSavingEdit}
                      >
                        {isSavingEdit ? (
                          <ActivityIndicator size="small" color="#000" />
                        ) : (
                          <Text style={styles.saveEditText}>Save Changes</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  /* View Details */
                  <View style={styles.detailView}>
                    <View style={styles.detailAmountCard}>
                      <Text style={styles.detailTypeLabel}>
                        {selectedTx.type.toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          styles.detailAmount,
                          {
                            color:
                              selectedTx.type === 'income'
                                ? Colors.income
                                : selectedTx.type === 'expense'
                                ? Colors.expense
                                : Colors.transfer,
                          },
                        ]}
                      >
                        {selectedTx.type === 'income'
                          ? '+'
                          : selectedTx.type === 'expense'
                          ? '-'
                          : ''}
                        {formatCurrency(selectedTx.amountPaise)}
                      </Text>
                      <Text style={styles.detailDate}>
                        {formatDate(selectedTx.date)}
                      </Text>
                    </View>

                    <View style={styles.detailList}>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Description</Text>
                        <Text style={styles.detailValue}>
                          {selectedTx.description}
                        </Text>
                      </View>

                      {selectedTx.type === 'transfer' ? (
                        <>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>From Account</Text>
                            <Text style={styles.detailValue}>
                              {selectedTx.accountName}
                            </Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>To Account</Text>
                            <Text style={styles.detailValue}>
                              {selectedTx.toAccountName ?? 'Unknown'}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Category</Text>
                            <Text style={styles.detailValue}>
                              {selectedTx.categoryName ?? 'General'}
                            </Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Account</Text>
                            <Text style={styles.detailValue}>
                              {selectedTx.accountName}
                            </Text>
                          </View>
                        </>
                      )}

                      {selectedTx.note ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Notes</Text>
                          <Text style={styles.detailValue}>{selectedTx.note}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={handleDelete}
                      >
                        <Ionicons name="trash-outline" size={18} color={Colors.expense} />
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => setIsEditing(true)}
                      >
                        <Ionicons name="create-outline" size={18} color="#000" />
                        <Text style={styles.editButtonText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    paddingVertical: 2,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipSelected: {
    backgroundColor: '#27272A',
    borderColor: Colors.primary,
  },
  filterText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  filterTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 80,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  txIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  txInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  txDescription: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  txMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  txTrailing: {
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalClose: {
    padding: 4,
  },
  modalError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 113, 133, 0.15)',
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalErrorText: {
    color: Colors.expense,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  detailView: {
    gap: Spacing.lg,
  },
  detailAmountCard: {
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailTypeLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textDisabled,
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailAmount: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    marginBottom: 4,
  },
  detailDate: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  detailList: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 113, 133, 0.15)',
    borderWidth: 1,
    borderColor: Colors.expense,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    gap: 6,
  },
  deleteButtonText: {
    color: Colors.expense,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    gap: 6,
  },
  editButtonText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  editForm: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  editInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
  },
  cancelEditButton: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelEditText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  saveEditButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveEditText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
