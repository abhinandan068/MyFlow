/**
 * Add Transaction Screen — MyFlow
 * Complete functional form for creating Expense, Income, and Transfer records.
 * Integrates directly with SQLite repositories.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { Account, Category, TransactionType } from '@/types';
import { getAccounts } from '@/db/accountsRepository';
import { getCategories } from '@/db/categoriesRepository';
import { createTransaction } from '@/db/transactionsRepository';
import { parseToPaise, formatCurrency } from '@/utils/currency';
import { today, toISODateString } from '@/utils/date';

export default function AddScreen() {
  const db = useSQLiteContext();

  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load accounts and categories from SQLite on focus/mount
  const loadMetadata = useCallback(async () => {
    try {
      setLoadingMetadata(true);
      const [accs, cats] = await Promise.all([
        getAccounts(db),
        getCategories(db),
      ]);
      setAccounts(accs);
      setCategories(cats);

      // Default select the first or default account if none selected
      if (accs.length > 0 && !accountId) {
        const defaultAcc = accs.find((a) => a.isDefault) || accs[0];
        setAccountId(defaultAcc.id);
        if (accs.length > 1) {
          const secondAcc = accs.find((a) => a.id !== defaultAcc.id) || accs[1];
          setToAccountId(secondAcc.id);
        }
      }
    } catch (err: any) {
      setErrorMessage(`Failed to load accounts: ${err.message}`);
    } finally {
      setLoadingMetadata(false);
    }
  }, [db, accountId]);

  useFocusEffect(
    useCallback(() => {
      loadMetadata();
    }, [loadMetadata])
  );

  // Filter categories by type
  const visibleCategories = categories.filter(
    (c) => c.type === type || c.type === 'both'
  );

  // Set default category when type changes if current category is invalid
  useEffect(() => {
    if (type !== 'transfer') {
      const valid = visibleCategories.some((c) => c.id === categoryId);
      if (!valid && visibleCategories.length > 0) {
        setCategoryId(visibleCategories[0].id);
      }
    }
  }, [type, visibleCategories, categoryId]);

  const handleSave = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    // Validate amount
    const paise = parseToPaise(amountStr);
    if (isNaN(paise) || paise <= 0) {
      setErrorMessage('Please enter a valid amount greater than ₹0.00');
      return;
    }

    // Validate description
    if (!description.trim()) {
      setErrorMessage('Please enter a description for this transaction');
      return;
    }

    // Validate accounts
    if (!accountId) {
      setErrorMessage('Please select an account');
      return;
    }

    if (type === 'transfer') {
      if (!toAccountId) {
        setErrorMessage('Please select a destination account for the transfer');
        return;
      }
      if (accountId === toAccountId) {
        setErrorMessage('Source and destination accounts must be different');
        return;
      }
    } else {
      if (!categoryId) {
        setErrorMessage('Please select a category');
        return;
      }
    }

    if (!date) {
      setErrorMessage('Please select a date');
      return;
    }

    setIsSaving(true);
    try {
      await createTransaction(db, {
        type,
        amountPaise: paise,
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : null,
        categoryId: type === 'transfer' ? null : categoryId,
        description: description.trim(),
        note: note.trim() || null,
        date,
      });

      setSuccessMessage('Transaction saved successfully!');

      // Reset form after successful save
      setTimeout(() => {
        setAmountStr('');
        setDescription('');
        setNote('');
        setDate(today());
        setSuccessMessage(null);
        router.navigate('/(tabs)');
      }, 500);
    } catch (err: any) {
      // Do not clear the form when validation or database operation fails
      setErrorMessage(err.message || 'Failed to save transaction');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    router.navigate('/(tabs)');
  };

  const setRelativeDate = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() - offsetDays);
    setDate(toISODateString(d));
  };

  if (loadingMetadata && accounts.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading accounts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Transaction</Text>
            <View style={styles.placeholder} />
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={20} color={Colors.expense} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Success Banner */}
          {successMessage ? (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.income} />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {/* Type Segment Selector */}
          <View style={styles.typeSelector}>
            <TouchableOpacity
              style={[
                styles.typeOption,
                type === 'expense' && styles.typeOptionExpense,
              ]}
              onPress={() => setType('expense')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="arrow-down-circle"
                size={18}
                color={type === 'expense' ? '#fff' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeText,
                  type === 'expense' && styles.typeTextActive,
                ]}
              >
                Expense
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeOption,
                type === 'income' && styles.typeOptionIncome,
              ]}
              onPress={() => setType('income')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="arrow-up-circle"
                size={18}
                color={type === 'income' ? '#fff' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeText,
                  type === 'income' && styles.typeTextActive,
                ]}
              >
                Income
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.typeOption,
                type === 'transfer' && styles.typeOptionTransfer,
              ]}
              onPress={() => setType('transfer')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="swap-horizontal"
                size={18}
                color={type === 'transfer' ? '#fff' : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.typeText,
                  type === 'transfer' && styles.typeTextActive,
                ]}
              >
                Transfer
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Card */}
          <View style={styles.amountCard}>
            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencyPrefix}>₹</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={Colors.textDisabled}
                keyboardType="decimal-pad"
                value={amountStr}
                onChangeText={setAmountStr}
                autoFocus={false}
              />
            </View>
          </View>

          {/* Description Input */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.textInput}
              placeholder={
                type === 'expense'
                  ? 'e.g. Groceries at supermarket'
                  : type === 'income'
                  ? 'e.g. Monthly salary'
                  : 'e.g. Transfer to savings'
              }
              placeholderTextColor={Colors.textDisabled}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* Accounts Section */}
          {type === 'transfer' ? (
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>From Account</Text>
              <View style={styles.chipRow}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={`from_${acc.id}`}
                    style={[
                      styles.accountChip,
                      accountId === acc.id && {
                        borderColor: acc.color,
                        backgroundColor: '#27272A',
                      },
                    ]}
                    onPress={() => setAccountId(acc.id)}
                  >
                    <View
                      style={[styles.accountDot, { backgroundColor: acc.color }]}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        accountId === acc.id && styles.chipTextSelected,
                      ]}
                    >
                      {acc.name}
                    </Text>
                    <Text style={styles.chipBalance}>
                      {formatCurrency(acc.balancePaise, { compact: true })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>
                To Account
              </Text>
              <View style={styles.chipRow}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={`to_${acc.id}`}
                    style={[
                      styles.accountChip,
                      toAccountId === acc.id && {
                        borderColor: Colors.transfer,
                        backgroundColor: '#27272A',
                      },
                    ]}
                    onPress={() => setToAccountId(acc.id)}
                  >
                    <View
                      style={[styles.accountDot, { backgroundColor: acc.color }]}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        toAccountId === acc.id && styles.chipTextSelected,
                      ]}
                    >
                      {acc.name}
                    </Text>
                    <Text style={styles.chipBalance}>
                      {formatCurrency(acc.balancePaise, { compact: true })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Account</Text>
              <View style={styles.chipRow}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountChip,
                      accountId === acc.id && {
                        borderColor: acc.color,
                        backgroundColor: '#27272A',
                      },
                    ]}
                    onPress={() => setAccountId(acc.id)}
                  >
                    <View
                      style={[styles.accountDot, { backgroundColor: acc.color }]}
                    />
                    <Text
                      style={[
                        styles.chipText,
                        accountId === acc.id && styles.chipTextSelected,
                      ]}
                    >
                      {acc.name}
                    </Text>
                    <Text style={styles.chipBalance}>
                      {formatCurrency(acc.balancePaise, { compact: true })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Category Section (Expense & Income only) */}
          {type !== 'transfer' ? (
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.chipRow}>
                {visibleCategories.map((cat) => {
                  const isSelected = categoryId === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        isSelected && {
                          borderColor: cat.color,
                          backgroundColor: '#27272A',
                        },
                      ]}
                      onPress={() => setCategoryId(cat.id)}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={16}
                        color={cat.color}
                        style={styles.chipIcon}
                      />
                      <Text
                        style={[
                          styles.chipText,
                          isSelected && styles.chipTextSelected,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Date Selection */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Date</Text>
            <View style={styles.dateSelectorRow}>
              <TouchableOpacity
                style={[
                  styles.datePill,
                  date === today() && styles.datePillActive,
                ]}
                onPress={() => setRelativeDate(0)}
              >
                <Text
                  style={[
                    styles.datePillText,
                    date === today() && styles.datePillTextActive,
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.datePill}
                onPress={() => setRelativeDate(1)}
              >
                <Text style={styles.datePillText}>Yesterday</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.dateInput}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={Colors.textDisabled}
              />
            </View>
          </View>

          {/* Optional Notes */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>Notes (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.notesInput]}
              placeholder="Add any extra notes..."
              placeholderTextColor={Colors.textDisabled}
              multiline
              numberOfLines={3}
              value={note}
              onChangeText={setNote}
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={isSaving}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                isSaving && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.85}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Transaction</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { padding: Spacing.lg, paddingBottom: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  placeholder: {
    width: 24,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 113, 133, 0.15)',
    borderWidth: 1,
    borderColor: Colors.expense,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  errorText: {
    color: Colors.expense,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    borderWidth: 1,
    borderColor: Colors.income,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  successText: {
    color: Colors.income,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 1,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    gap: 6,
  },
  typeOptionExpense: {
    backgroundColor: Colors.expense,
  },
  typeOptionIncome: {
    backgroundColor: Colors.income,
  },
  typeOptionTransfer: {
    backgroundColor: Colors.transfer,
  },
  typeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  typeTextActive: {
    color: '#fff',
  },
  amountCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    marginRight: Spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    paddingVertical: 4,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  textInput: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  accountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  chipBalance: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
    marginLeft: 4,
  },
  dateSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  datePill: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  datePillActive: {
    backgroundColor: '#27272A',
    borderColor: Colors.primary,
  },
  datePillText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  datePillTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  dateInput: {
    flex: 1,
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
  },
  saveButton: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
