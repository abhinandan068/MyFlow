/**
 * People & Lending Screen — MyFlow
 * Complete module for People directory, Lending, Borrowing, and Repayments.
 * Integrates with SQLite repositories using the Obsidian Minimal Dark theme.
 */
import React, { useState, useCallback, useEffect } from 'react';
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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { AVATAR_COLORS } from '@/constants/categories';
import {
  PersonWithTotals,
  LoanWithDetails,
  LoanRepaymentWithDetails,
  LoanType,
  Account,
  PersonFinancialAnalysis,
  PersonTimelineEvent,
  PersonTimelineFilterType,
  PersonPeriodAnalytics,
  DateRangePreset,
} from '@/types';
import {
  getPeople,
  createPerson,
  updatePerson,
  deletePerson,
} from '@/db/peopleRepository';
import {
  getLoans,
  createLoan,
  createRepayment,
  getRepaymentsForLoan,
  getLendingSummary,
  deleteLoan,
  deleteRepayment,
} from '@/db/loansRepository';
import {
  getPersonFinancialAnalysis,
  getPersonTimeline,
  getPersonPeriodAnalytics,
} from '@/db/peopleAnalysisRepository';
import { getAccounts } from '@/db/accountsRepository';
import { formatCurrency, parseToPaise } from '@/utils/currency';
import { today, formatDate, relativeDateLabel } from '@/utils/date';
import { PersonTrendChart } from '@/components/PersonTrendChart';

type TabView = 'lent' | 'borrowed' | 'all';

export default function PeopleScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ tab?: string }>();

  // Tab View: 'lent' (Owed to You) | 'borrowed' (You Owe) | 'all'
  const [activeTab, setActiveTab] = useState<TabView>(
    params.tab === 'borrowed' ? 'borrowed' : 'lent'
  );

  useEffect(() => {
    if (params.tab === 'borrowed' || params.tab === 'lent') {
      setActiveTab(params.tab as TabView);
    }
  }, [params.tab]);

  const [people, setPeople] = useState<PersonWithTotals[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Summary figures
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [totalPayables, setTotalPayables] = useState(0);

  // Modals
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [personName, setPersonName] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [personNotes, setPersonNotes] = useState('');
  const [personColor, setPersonColor] = useState(AVATAR_COLORS[0]);
  const [personError, setPersonError] = useState<string | null>(null);

  // Selected Person Details Modal
  const [selectedPerson, setSelectedPerson] = useState<PersonWithTotals | null>(null);
  const [personDetailTab, setPersonDetailTab] = useState<'loans' | 'analysis' | 'timeline'>('loans');
  const [personLoans, setPersonLoans] = useState<LoanWithDetails[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [loanHistoryTab, setLoanHistoryTab] = useState<'active' | 'settled'>('active');

  // Person Analysis & Analytics
  const [personAnalysis, setPersonAnalysis] = useState<PersonFinancialAnalysis | null>(null);
  const [periodAnalytics, setPeriodAnalytics] = useState<PersonPeriodAnalytics | null>(null);
  const [selectedPeriodPreset, setSelectedPeriodPreset] = useState<DateRangePreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState(today());
  const [customEndDate, setCustomEndDate] = useState(today());
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);

  // Timeline
  const [timelineEvents, setTimelineEvents] = useState<PersonTimelineEvent[]>([]);
  const [timelineFilterType, setTimelineFilterType] = useState<PersonTimelineFilterType>('all');
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // New Loan Modal
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanPersonId, setLoanPersonId] = useState('');
  const [loanType, setLoanType] = useState<LoanType>('lent');
  const [loanAmountStr, setLoanAmountStr] = useState('');
  const [loanAccountId, setLoanAccountId] = useState('');
  const [loanDescription, setLoanDescription] = useState('');
  const [loanDate, setLoanDate] = useState(today());
  const [loanDueDate, setLoanDueDate] = useState('');
  const [loanNote, setLoanNote] = useState('');
  const [loanError, setLoanError] = useState<string | null>(null);
  const [isSavingLoan, setIsSavingLoan] = useState(false);

  // Repayment Modal
  const [showRepaymentModal, setShowRepaymentModal] = useState(false);
  const [repaymentLoan, setRepaymentLoan] = useState<LoanWithDetails | null>(null);
  const [repaymentAmountStr, setRepaymentAmountStr] = useState('');
  const [repaymentAccountId, setRepaymentAccountId] = useState('');
  const [repaymentDate, setRepaymentDate] = useState(today());
  const [repaymentNote, setRepaymentNote] = useState('');
  const [repaymentError, setRepaymentError] = useState<string | null>(null);
  const [isSavingRepayment, setIsSavingRepayment] = useState(false);

  // Expanded repayments view per loan
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [repaymentsList, setRepaymentsList] = useState<LoanRepaymentWithDetails[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [peopleList, accList, summary] = await Promise.all([
        getPeople(db, search),
        getAccounts(db),
        getLendingSummary(db),
      ]);
      setPeople(peopleList);
      setAccounts(accList);
      setTotalReceivables(summary.totalReceivablesPaise);
      setTotalPayables(summary.totalPayablesPaise);

      if (accList.length > 0 && !loanAccountId) {
        setLoanAccountId(accList[0].id);
        setRepaymentAccountId(accList[0].id);
      }
    } catch (err) {
      console.error('Failed to load people data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [db, search, loanAccountId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Load loans for selected person
  const loadPersonLoans = useCallback(
    async (personId: string) => {
      try {
        setLoadingLoans(true);
        const loans = await getLoans(db, { personId });
        setPersonLoans(loans);
      } catch (err) {
        console.error('Failed to load loans:', err);
      } finally {
        setLoadingLoans(false);
      }
    },
    [db]
  );

  // Load analysis & monthly metrics for selected person
  const loadPersonAnalysis = useCallback(
    async (
      personId: string,
      preset: DateRangePreset,
      customStart?: string,
      customEnd?: string
    ) => {
      try {
        setLoadingAnalysis(true);
        const [analysis, period] = await Promise.all([
          getPersonFinancialAnalysis(db, personId),
          getPersonPeriodAnalytics(db, personId, preset, customStart, customEnd),
        ]);
        setPersonAnalysis(analysis);
        setPeriodAnalytics(period);
      } catch (err) {
        console.error('Failed to load person analysis:', err);
      } finally {
        setLoadingAnalysis(false);
      }
    },
    [db]
  );

  // Load chronological timeline for selected person
  const loadPersonTimeline = useCallback(
    async (personId: string, filterType: PersonTimelineFilterType) => {
      try {
        setLoadingTimeline(true);
        const filter = filterType === 'all' ? undefined : { types: [filterType] };
        const events = await getPersonTimeline(db, personId, filter);
        setTimelineEvents(events);
      } catch (err) {
        console.error('Failed to load person timeline:', err);
      } finally {
        setLoadingTimeline(false);
      }
    },
    [db]
  );

  const openPersonDetail = (person: PersonWithTotals) => {
    setSelectedPerson(person);
    setPersonDetailTab('loans');
    setLoanHistoryTab('active');
    setExpandedLoanId(null);
    setSelectedPeriodPreset('this_month');
    setTimelineFilterType('all');
    loadPersonLoans(person.id);
    loadPersonAnalysis(person.id, 'this_month');
    loadPersonTimeline(person.id, 'all');
  };

  const closePersonDetail = () => {
    setSelectedPerson(null);
    setPersonLoans([]);
    setExpandedLoanId(null);
    setPersonAnalysis(null);
    setPeriodAnalytics(null);
    setTimelineEvents([]);
    loadData();
  };

  const handleDeleteRepayment = (repaymentId: string) => {
    Alert.alert(
      'Delete Repayment',
      'Are you sure you want to delete this repayment record? The repayment amount will be reversed from your account balance and the loan balance will be restored.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRepayment(db, repaymentId);
              if (selectedPerson) {
                loadPersonLoans(selectedPerson.id);
                loadPersonAnalysis(
                  selectedPerson.id,
                  selectedPeriodPreset,
                  customStartDate,
                  customEndDate
                );
                loadPersonTimeline(selectedPerson.id, timelineFilterType);
                if (expandedLoanId) {
                  const updatedReps = await getRepaymentsForLoan(db, expandedLoanId);
                  setRepaymentsList(updatedReps);
                }
              }
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete repayment');
            }
          },
        },
      ]
    );
  };

  // Person creation / editing
  const openAddPersonModal = () => {
    setEditingPersonId(null);
    setPersonName('');
    setPersonPhone('');
    setPersonNotes('');
    setPersonColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
    setPersonError(null);
    setShowPersonModal(true);
  };

  const openEditPersonModal = (person: PersonWithTotals) => {
    setEditingPersonId(person.id);
    setPersonName(person.name);
    setPersonPhone(person.phone || '');
    setPersonNotes(person.notes || '');
    setPersonColor(person.avatarColor);
    setPersonError(null);
    setShowPersonModal(true);
  };

  const handleSavePerson = async () => {
    setPersonError(null);
    if (!personName.trim()) {
      setPersonError('Name is required');
      return;
    }

    try {
      if (editingPersonId) {
        await updatePerson(db, editingPersonId, {
          name: personName.trim(),
          phone: personPhone.trim() || null,
          notes: personNotes.trim() || null,
          avatarColor: personColor,
        });
        if (selectedPerson && selectedPerson.id === editingPersonId) {
          setSelectedPerson({
            ...selectedPerson,
            name: personName.trim(),
            phone: personPhone.trim() || null,
            notes: personNotes.trim() || null,
            avatarColor: personColor,
          });
        }
      } else {
        await createPerson(db, {
          name: personName.trim(),
          phone: personPhone.trim() || null,
          notes: personNotes.trim() || null,
          avatarColor: personColor,
        });
      }
      setShowPersonModal(false);
      loadData();
    } catch (err: any) {
      setPersonError(err.message || 'Failed to save person');
    }
  };

  // New Loan Flow
  const openNewLoanModal = (personId?: string, defaultType?: LoanType) => {
    setLoanPersonId(personId || (people.length > 0 ? people[0].id : ''));
    setLoanType(defaultType || (activeTab === 'borrowed' ? 'borrowed' : 'lent'));
    setLoanAmountStr('');
    setLoanDescription('');
    setLoanDate(today());
    setLoanDueDate('');
    setLoanNote('');
    setLoanError(null);
    setShowLoanModal(true);
  };

  const handleSaveLoan = async () => {
    setLoanError(null);
    const paise = parseToPaise(loanAmountStr);
    if (isNaN(paise) || paise <= 0) {
      setLoanError('Please enter a valid amount greater than ₹0.00');
      return;
    }
    if (!loanDescription.trim()) {
      setLoanError('Description is required');
      return;
    }
    if (!loanPersonId) {
      setLoanError('Please select a person');
      return;
    }
    if (!loanAccountId) {
      setLoanError('Please select an account');
      return;
    }

    setIsSavingLoan(true);
    try {
      await createLoan(db, {
        personId: loanPersonId,
        type: loanType,
        principalPaise: paise,
        accountId: loanAccountId,
        description: loanDescription.trim(),
        date: loanDate,
        dueDate: loanDueDate.trim() || null,
        note: loanNote.trim() || null,
      });

      setShowLoanModal(false);
      if (selectedPerson) {
        loadPersonLoans(selectedPerson.id);
        loadPersonAnalysis(selectedPerson.id, selectedPeriodPreset, customStartDate, customEndDate);
        loadPersonTimeline(selectedPerson.id, timelineFilterType);
      }
      loadData();
    } catch (err: any) {
      setLoanError(err.message || 'Failed to create loan');
    } finally {
      setIsSavingLoan(false);
    }
  };

  // Repayment Flow
  const openRepaymentModal = (loan: LoanWithDetails) => {
    setRepaymentLoan(loan);
    setRepaymentAmountStr((loan.outstandingPaise / 100).toFixed(2));
    setRepaymentDate(today());
    setRepaymentNote('');
    setRepaymentError(null);
    if (accounts.length > 0) {
      setRepaymentAccountId(accounts[0].id);
    }
    setShowRepaymentModal(true);
  };

  const handleSaveRepayment = async () => {
    if (!repaymentLoan) return;
    setRepaymentError(null);

    const paise = parseToPaise(repaymentAmountStr);
    if (isNaN(paise) || paise <= 0) {
      setRepaymentError('Please enter a valid amount greater than ₹0.00');
      return;
    }
    if (paise > repaymentLoan.outstandingPaise) {
      setRepaymentError(
        `Amount cannot exceed outstanding balance of ₹${(
          repaymentLoan.outstandingPaise / 100
        ).toFixed(2)}`
      );
      return;
    }
    if (!repaymentAccountId) {
      setRepaymentError('Please select an account');
      return;
    }

    setIsSavingRepayment(true);
    try {
      await createRepayment(db, {
        loanId: repaymentLoan.id,
        amountPaise: paise,
        accountId: repaymentAccountId,
        date: repaymentDate,
        note: repaymentNote.trim() || null,
      });

      setShowRepaymentModal(false);
      if (selectedPerson) {
        loadPersonLoans(selectedPerson.id);
        loadPersonAnalysis(selectedPerson.id, selectedPeriodPreset, customStartDate, customEndDate);
        loadPersonTimeline(selectedPerson.id, timelineFilterType);
      }
      loadData();
    } catch (err: any) {
      setRepaymentError(err.message || 'Failed to record repayment');
    } finally {
      setIsSavingRepayment(false);
    }
  };

  // View repayment history of a specific loan
  const toggleLoanRepayments = async (loanId: string) => {
    if (expandedLoanId === loanId) {
      setExpandedLoanId(null);
      setRepaymentsList([]);
    } else {
      setExpandedLoanId(loanId);
      const list = await getRepaymentsForLoan(db, loanId);
      setRepaymentsList(list);
    }
  };

  // Delete Loan confirmation
  const handleDeleteLoan = (loanId: string) => {
    Alert.alert(
      'Delete Loan',
      'Are you sure you want to delete this loan? This will reverse all associated account balance changes and delete its repayment history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLoan(db, loanId);
              if (selectedPerson) {
                loadPersonLoans(selectedPerson.id);
                loadPersonAnalysis(selectedPerson.id, selectedPeriodPreset, customStartDate, customEndDate);
                loadPersonTimeline(selectedPerson.id, timelineFilterType);
              }
              loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete loan');
            }
          },
        },
      ]
    );
  };

  // Filter people list based on active tab
  const filteredPeople = people.filter((p) => {
    if (activeTab === 'lent') {
      return p.totalLentOutstandingPaise > 0;
    }
    if (activeTab === 'borrowed') {
      return p.totalBorrowedOutstandingPaise > 0;
    }
    return true;
  });

  const activePersonLoans = personLoans.filter((l) =>
    loanHistoryTab === 'active' ? !l.isClosed : l.isClosed
  );

  const handleSelectPeriodPreset = (preset: DateRangePreset) => {
    setSelectedPeriodPreset(preset);
    if (preset === 'custom') {
      setShowCustomDateModal(true);
    } else if (selectedPerson) {
      loadPersonAnalysis(selectedPerson.id, preset);
    }
  };

  const handleApplyCustomPeriod = () => {
    setShowCustomDateModal(false);
    if (selectedPerson) {
      loadPersonAnalysis(selectedPerson.id, 'custom', customStartDate, customEndDate);
    }
  };

  const handleSelectTimelineFilter = (filterType: PersonTimelineFilterType) => {
    setTimelineFilterType(filterType);
    if (selectedPerson) {
      loadPersonTimeline(selectedPerson.id, filterType);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>People & Loans</Text>
        <TouchableOpacity style={styles.addPersonButton} onPress={openAddPersonModal}>
          <Ionicons name="person-add" size={18} color="#000" />
          <Text style={styles.addPersonText}>Person</Text>
        </TouchableOpacity>
      </View>

      {/* Summary KPI Cards */}
      <View style={styles.summaryContainer}>
        {/* Owed to You Card */}
        <TouchableOpacity
          style={[
            styles.summaryCard,
            activeTab === 'lent' && styles.summaryCardActiveLent,
          ]}
          onPress={() => setActiveTab('lent')}
          activeOpacity={0.8}
        >
          <View style={styles.summaryTop}>
            <View style={[styles.kpiIcon, { backgroundColor: 'rgba(74, 222, 128, 0.15)' }]}>
              <Ionicons name="arrow-down-circle" size={18} color={Colors.income} />
            </View>
            <Text style={styles.summaryLabel}>Owed to You</Text>
          </View>
          <Text style={[styles.summaryAmount, { color: Colors.income }]}>
            {formatCurrency(totalReceivables)}
          </Text>
          <Text style={styles.summarySub}>Receivables</Text>
        </TouchableOpacity>

        {/* You Owe Card */}
        <TouchableOpacity
          style={[
            styles.summaryCard,
            activeTab === 'borrowed' && styles.summaryCardActiveBorrowed,
          ]}
          onPress={() => setActiveTab('borrowed')}
          activeOpacity={0.8}
        >
          <View style={styles.summaryTop}>
            <View style={[styles.kpiIcon, { backgroundColor: 'rgba(251, 113, 133, 0.15)' }]}>
              <Ionicons name="arrow-up-circle" size={18} color={Colors.expense} />
            </View>
            <Text style={styles.summaryLabel}>You Owe</Text>
          </View>
          <Text style={[styles.summaryAmount, { color: Colors.expense }]}>
            {formatCurrency(totalPayables)}
          </Text>
          <Text style={styles.summarySub}>Payables</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Selectors */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'lent' && styles.tabChipActive]}
          onPress={() => setActiveTab('lent')}
        >
          <Text style={[styles.tabText, activeTab === 'lent' && styles.tabTextActive]}>
            Owed to You
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'borrowed' && styles.tabChipActive]}
          onPress={() => setActiveTab('borrowed')}
        >
          <Text style={[styles.tabText, activeTab === 'borrowed' && styles.tabTextActive]}>
            You Owe
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabChip, activeTab === 'all' && styles.tabChipActive]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
            All ({people.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search people by name or phone..."
          placeholderTextColor={Colors.textDisabled}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* People List */}
      {loading && people.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPeople}
          keyExtractor={(item) => item.id}
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
          renderItem={({ item }) => {
            const hasLent = item.totalLentOutstandingPaise > 0;
            const hasBorrowed = item.totalBorrowedOutstandingPaise > 0;

            return (
              <TouchableOpacity
                style={styles.personCard}
                onPress={() => openPersonDetail(item)}
                activeOpacity={0.7}
              >
                {/* Avatar */}
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: `${item.avatarColor}30`, borderColor: item.avatarColor },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: item.avatarColor }]}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Details */}
                <View style={styles.personInfo}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.phone ? (
                    <Text style={styles.personPhone}>{item.phone}</Text>
                  ) : null}
                  <Text style={styles.loanCounts}>
                    {item.activeLoanCount} active • {item.settledLoanCount} settled
                  </Text>
                </View>

                {/* Amount Figures */}
                <View style={styles.personAmounts}>
                  {activeTab === 'lent' || (activeTab === 'all' && hasLent) ? (
                    <View style={styles.amountPill}>
                      <Text style={styles.pillLabel}>OWES YOU</Text>
                      <Text style={[styles.pillAmount, { color: Colors.income }]}>
                        {formatCurrency(item.totalLentOutstandingPaise)}
                      </Text>
                    </View>
                  ) : null}

                  {activeTab === 'borrowed' || (activeTab === 'all' && hasBorrowed) ? (
                    <View style={styles.amountPill}>
                      <Text style={styles.pillLabel}>YOU OWE</Text>
                      <Text style={[styles.pillAmount, { color: Colors.expense }]}>
                        {formatCurrency(item.totalBorrowedOutstandingPaise)}
                      </Text>
                    </View>
                  ) : null}

                  {!hasLent && !hasBorrowed ? (
                    <Text style={styles.settledBadge}>All Settled</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={44} color={Colors.textDisabled} />
              <Text style={styles.emptyTitle}>
                {activeTab === 'lent'
                  ? 'No Receivables'
                  : activeTab === 'borrowed'
                  ? 'No Payables'
                  : 'No People Found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'lent'
                  ? 'No one currently owes you money.'
                  : activeTab === 'borrowed'
                  ? 'You currently owe nothing to anyone.'
                  : 'Add contacts to start tracking loans and debts.'}
              </Text>
              <TouchableOpacity
                style={styles.emptyActionBtn}
                onPress={() => openNewLoanModal()}
              >
                <Ionicons name="add" size={18} color="#000" />
                <Text style={styles.emptyActionText}>Record a Loan</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Floating Action Button: Record Loan */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => openNewLoanModal()}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={24} color="#000" />
        <Text style={styles.fabText}>New Loan</Text>
      </TouchableOpacity>

      {/* ──────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: Person Detail & Loan History */}
      {/* ──────────────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={selectedPerson !== null}
        animationType="slide"
        onRequestClose={closePersonDetail}
      >
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom', 'left', 'right']}>
          {selectedPerson ? (
            <View style={styles.modalFullContainer}>
              {/* Header */}
              <View style={styles.modalHeaderBar}>
                <TouchableOpacity onPress={closePersonDetail} style={styles.modalCloseBtn}>
                  <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  {selectedPerson.name}
                </Text>
                <TouchableOpacity
                  onPress={() => openEditPersonModal(selectedPerson)}
                  style={styles.modalEditBtn}
                >
                  <Ionicons name="create-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Person KPI Card */}
              <View style={styles.personHeaderCard}>
                <View style={styles.personHeaderTop}>
                  <View
                    style={[
                      styles.avatarLarge,
                      {
                        backgroundColor: `${selectedPerson.avatarColor}30`,
                        borderColor: selectedPerson.avatarColor,
                      },
                    ]}
                  >
                    <Text style={[styles.avatarLargeText, { color: selectedPerson.avatarColor }]}>
                      {selectedPerson.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.personHeaderInfo}>
                    <Text style={styles.personHeaderName}>{selectedPerson.name}</Text>
                    {selectedPerson.phone ? (
                      <Text style={styles.personHeaderPhone}>{selectedPerson.phone}</Text>
                    ) : null}
                    {selectedPerson.notes ? (
                      <Text style={styles.personHeaderNotes}>{selectedPerson.notes}</Text>
                    ) : null}
                  </View>
                </View>

                {/* Balance Split */}
                <View style={styles.personSplitRow}>
                  <View style={styles.splitBox}>
                    <Text style={styles.splitLabel}>OWED TO YOU</Text>
                    <Text style={[styles.splitAmount, { color: Colors.income }]}>
                      {formatCurrency(selectedPerson.totalLentOutstandingPaise)}
                    </Text>
                  </View>
                  <View style={styles.splitDivider} />
                  <View style={styles.splitBox}>
                    <Text style={styles.splitLabel}>YOU OWE</Text>
                    <Text style={[styles.splitAmount, { color: Colors.expense }]}>
                      {formatCurrency(selectedPerson.totalBorrowedOutstandingPaise)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Person Sub-Tabs: Loans | Analysis | Timeline */}
              <View style={styles.personSubTabSwitch}>
                <TouchableOpacity
                  style={[
                    styles.personSubTabBtn,
                    personDetailTab === 'loans' && styles.personSubTabBtnActive,
                  ]}
                  onPress={() => setPersonDetailTab('loans')}
                >
                  <Ionicons
                    name="receipt-outline"
                    size={15}
                    color={personDetailTab === 'loans' ? '#000' : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.personSubTabText,
                      personDetailTab === 'loans' && styles.personSubTabTextActive,
                    ]}
                  >
                    Loans
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.personSubTabBtn,
                    personDetailTab === 'analysis' && styles.personSubTabBtnActive,
                  ]}
                  onPress={() => {
                    setPersonDetailTab('analysis');
                    if (selectedPerson) {
                      loadPersonAnalysis(
                        selectedPerson.id,
                        selectedPeriodPreset,
                        customStartDate,
                        customEndDate
                      );
                    }
                  }}
                >
                  <Ionicons
                    name="stats-chart-outline"
                    size={15}
                    color={personDetailTab === 'analysis' ? '#000' : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.personSubTabText,
                      personDetailTab === 'analysis' && styles.personSubTabTextActive,
                    ]}
                  >
                    Analysis
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.personSubTabBtn,
                    personDetailTab === 'timeline' && styles.personSubTabBtnActive,
                  ]}
                  onPress={() => {
                    setPersonDetailTab('timeline');
                    if (selectedPerson) {
                      loadPersonTimeline(selectedPerson.id, timelineFilterType);
                    }
                  }}
                >
                  <Ionicons
                    name="git-commit-outline"
                    size={15}
                    color={personDetailTab === 'timeline' ? '#000' : Colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.personSubTabText,
                      personDetailTab === 'timeline' && styles.personSubTabTextActive,
                    ]}
                  >
                    Timeline
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ─── TAB 1: LOANS ────────────────────────────────────────────────────────── */}
              {personDetailTab === 'loans' && (
                <View style={{ flex: 1 }}>
                  {/* Active vs Settled Tab */}
                  <View style={styles.loanTabSwitch}>
                    <TouchableOpacity
                      style={[
                        styles.loanTabBtn,
                        loanHistoryTab === 'active' && styles.loanTabBtnActive,
                      ]}
                      onPress={() => setLoanHistoryTab('active')}
                    >
                      <Text
                        style={[
                          styles.loanTabText,
                          loanHistoryTab === 'active' && styles.loanTabTextActive,
                        ]}
                      >
                        Active Loans
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.loanTabBtn,
                        loanHistoryTab === 'settled' && styles.loanTabBtnActive,
                      ]}
                      onPress={() => setLoanHistoryTab('settled')}
                    >
                      <Text
                        style={[
                          styles.loanTabText,
                          loanHistoryTab === 'settled' && styles.loanTabTextActive,
                        ]}
                      >
                        Settled Loans
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Loans List */}
                  {loadingLoans ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                    </View>
                  ) : (
                    <FlatList
                      data={activePersonLoans}
                      keyExtractor={(l) => l.id}
                      contentContainerStyle={styles.loansListContent}
                      renderItem={({ item }) => {
                        const isLent = item.type === 'lent';
                        const isExpanded = expandedLoanId === item.id;
                        const percentRepaid =
                          item.principalPaise > 0
                            ? Math.min(100, (item.repaidPaise / item.principalPaise) * 100)
                            : 0;

                        return (
                          <View style={styles.loanCard}>
                            {/* Loan Top Bar */}
                            <View style={styles.loanCardHeader}>
                              <View
                                style={[
                                  styles.directionBadge,
                                  isLent ? styles.badgeLent : styles.badgeBorrowed,
                                ]}
                              >
                                <Ionicons
                                  name={isLent ? 'arrow-down-circle' : 'arrow-up-circle'}
                                  size={14}
                                  color={isLent ? Colors.income : Colors.expense}
                                />
                                <Text
                                  style={[
                                    styles.directionBadgeText,
                                    { color: isLent ? Colors.income : Colors.expense },
                                  ]}
                                >
                                  {isLent ? 'YOU LENT' : 'YOU BORROWED'}
                                </Text>
                              </View>

                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                {item.isClosed ? (
                                  <View style={styles.settledBadgeTag}>
                                    <Text style={styles.settledBadgeTagText}>SETTLED</Text>
                                  </View>
                                ) : null}
                                <TouchableOpacity
                                  onPress={() => handleDeleteLoan(item.id)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons
                                    name="trash-outline"
                                    size={18}
                                    color={Colors.textDisabled}
                                  />
                                </TouchableOpacity>
                              </View>
                            </View>

                            {/* Description & Account */}
                            <Text style={styles.loanDescription}>{item.description}</Text>
                            <Text style={styles.loanAccountMeta}>
                              via {item.accountName} • {formatDate(item.date)}
                              {item.dueDate ? ` • Due: ${formatDate(item.dueDate)}` : ''}
                            </Text>

                            {/* Amount Progress */}
                            <View style={styles.loanAmountsRow}>
                              <View>
                                <Text style={styles.loanAmountSub}>Original Principal</Text>
                                <Text style={styles.loanPrincipal}>
                                  {formatCurrency(item.principalPaise)}
                                </Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.loanAmountSub}>Outstanding</Text>
                                <Text
                                  style={[
                                    styles.loanOutstanding,
                                    { color: isLent ? Colors.income : Colors.expense },
                                  ]}
                                >
                                  {formatCurrency(item.outstandingPaise)}
                                </Text>
                              </View>
                            </View>

                            {/* Progress Bar */}
                            <View style={styles.progressBarBg}>
                              <View
                                style={[
                                  styles.progressBarFill,
                                  {
                                    width: `${percentRepaid}%`,
                                    backgroundColor: isLent ? Colors.income : Colors.expense,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.repaidMeta}>
                              {formatCurrency(item.repaidPaise)} repaid ({percentRepaid.toFixed(0)}%)
                            </Text>

                            {/* Action Buttons */}
                            <View style={styles.loanActionsRow}>
                              {!item.isClosed ? (
                                <TouchableOpacity
                                  style={styles.repayButton}
                                  onPress={() => openRepaymentModal(item)}
                                >
                                  <Ionicons name="checkmark-circle" size={16} color="#000" />
                                  <Text style={styles.repayButtonText}>Record Repayment</Text>
                                </TouchableOpacity>
                              ) : null}

                              <TouchableOpacity
                                style={styles.historyToggleBtn}
                                onPress={() => toggleLoanRepayments(item.id)}
                              >
                                <Ionicons
                                  name={isExpanded ? 'chevron-up' : 'time-outline'}
                                  size={16}
                                  color={Colors.textSecondary}
                                />
                                <Text style={styles.historyToggleText}>
                                  {isExpanded ? 'Hide History' : 'Repayments'}
                                </Text>
                              </TouchableOpacity>
                            </View>

                            {/* Expandable Repayments History */}
                            {isExpanded ? (
                              <View style={styles.repaymentsHistoryBox}>
                                <Text style={styles.repaymentsHistoryTitle}>Repayment History</Text>
                                {repaymentsList.length > 0 ? (
                                  repaymentsList.map((rep) => (
                                    <View key={rep.id} style={styles.repaymentRow}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={styles.repaymentAmount}>
                                          +{formatCurrency(rep.amountPaise)}
                                        </Text>
                                        <Text style={styles.repaymentAccount}>
                                          via {rep.accountName}
                                          {rep.note ? ` • ${rep.note}` : ''}
                                        </Text>
                                      </View>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                        <Text style={styles.repaymentDate}>
                                          {relativeDateLabel(rep.date)}
                                        </Text>
                                        <TouchableOpacity
                                          onPress={() => handleDeleteRepayment(rep.id)}
                                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                        >
                                          <Ionicons
                                            name="trash-outline"
                                            size={16}
                                            color={Colors.textDisabled}
                                          />
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  ))
                                ) : (
                                  <Text style={styles.noRepaymentsText}>
                                    No repayments recorded yet.
                                  </Text>
                                )}
                              </View>
                            ) : null}
                          </View>
                        );
                      }}
                      ListEmptyComponent={
                        <View style={styles.emptyCard}>
                          <Text style={styles.emptyTitle}>
                            {loanHistoryTab === 'active' ? 'No Active Loans' : 'No Settled Loans'}
                          </Text>
                          <Text style={styles.emptySubtitle}>
                            {loanHistoryTab === 'active'
                              ? 'All loans with this person are settled.'
                              : 'Settled loans will appear here after full repayment.'}
                          </Text>
                        </View>
                      }
                    />
                  )}
                </View>
              )}

              {/* ─── TAB 2: ANALYSIS ────────────────────────────────────────────────────── */}
              {personDetailTab === 'analysis' && (
                <ScrollView
                  style={styles.analysisScrollView}
                  contentContainerStyle={styles.analysisContent}
                  showsVerticalScrollIndicator={false}
                >
                  {loadingAnalysis ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.loadingText}>Calculating analysis...</Text>
                    </View>
                  ) : (
                    <>
                      {/* Net Receivable Banner */}
                      {(() => {
                        const net =
                          personAnalysis?.netReceivablePaise ??
                          selectedPerson.totalLentOutstandingPaise -
                            selectedPerson.totalBorrowedOutstandingPaise;
                        const isReceivable = net > 0;
                        const isPayable = net < 0;

                        return (
                          <View
                            style={[
                              styles.netBanner,
                              isReceivable
                                ? styles.netBannerReceivable
                                : isPayable
                                ? styles.netBannerPayable
                                : styles.netBannerSettled,
                            ]}
                          >
                            <View style={styles.netBannerTop}>
                              <View
                                style={[
                                  styles.netBadge,
                                  {
                                    backgroundColor: isReceivable
                                      ? 'rgba(74, 222, 128, 0.2)'
                                      : isPayable
                                      ? 'rgba(251, 113, 133, 0.2)'
                                      : 'rgba(161, 161, 170, 0.2)',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.netBadgeText,
                                    {
                                      color: isReceivable
                                        ? Colors.income
                                        : isPayable
                                        ? Colors.expense
                                        : Colors.textSecondary,
                                    },
                                  ]}
                                >
                                  {isReceivable
                                    ? 'NET RECEIVABLE'
                                    : isPayable
                                    ? 'NET PAYABLE'
                                    : 'BALANCE SETTLED'}
                                </Text>
                              </View>
                              <Text style={styles.netFormulaNote}>
                                (Receivables − Payables)
                              </Text>
                            </View>

                            <Text
                              style={[
                                styles.netAmount,
                                {
                                  color: isReceivable
                                    ? Colors.income
                                    : isPayable
                                    ? Colors.expense
                                    : Colors.textPrimary,
                                },
                              ]}
                            >
                              {isReceivable ? '+' : isPayable ? '-' : ''}
                              {formatCurrency(Math.abs(net))}
                            </Text>
                            <Text style={styles.netDescription}>
                              {isReceivable
                                ? `${selectedPerson.name} owes you ${formatCurrency(net)} net.`
                                : isPayable
                                ? `You owe ${selectedPerson.name} ${formatCurrency(Math.abs(net))} net.`
                                : `All balances with ${selectedPerson.name} are fully settled.`}
                            </Text>
                          </View>
                        );
                      })()}

                      {/* Current Point-in-Time Balances */}
                      <View style={styles.analysisCard}>
                        <View style={styles.analysisCardHeader}>
                          <Ionicons name="scale-outline" size={16} color={Colors.primary} />
                          <Text style={styles.analysisCardTitle}>Current Outstanding Balances</Text>
                        </View>
                        <Text style={styles.analysisCardSub}>
                          Point-in-time active balances currently unpaid
                        </Text>

                        <View style={styles.twoColumnGrid}>
                          <View style={styles.columnBox}>
                            <Text style={styles.columnLabel}>OUTSTANDING RECEIVABLES</Text>
                            <Text style={[styles.columnValue, { color: Colors.income }]}>
                              {formatCurrency(personAnalysis?.outstandingReceivablesPaise ?? 0)}
                            </Text>
                            <Text style={styles.columnMeta}>Owed to you</Text>
                          </View>
                          <View style={styles.columnDivider} />
                          <View style={styles.columnBox}>
                            <Text style={styles.columnLabel}>OUTSTANDING PAYABLES</Text>
                            <Text style={[styles.columnValue, { color: Colors.expense }]}>
                              {formatCurrency(personAnalysis?.outstandingPayablesPaise ?? 0)}
                            </Text>
                            <Text style={styles.columnMeta}>You owe</Text>
                          </View>
                        </View>
                      </View>

                      {/* Historical Lifetime Totals */}
                      <View style={styles.analysisCard}>
                        <View style={styles.analysisCardHeader}>
                          <Ionicons name="time-outline" size={16} color={Colors.primary} />
                          <Text style={styles.analysisCardTitle}>Historical Lifetime Totals</Text>
                        </View>
                        <Text style={styles.analysisCardSub}>
                          Total financial activity ever recorded with {selectedPerson.name}
                        </Text>

                        <View style={styles.metricGrid2x2}>
                          <View style={styles.metricGridItem}>
                            <Text style={styles.gridItemLabel}>TOTAL LENT</Text>
                            <Text style={[styles.gridItemValue, { color: Colors.income }]}>
                              {formatCurrency(personAnalysis?.totalLentPaise ?? 0)}
                            </Text>
                            <Text style={styles.gridItemSub}>Principal lent</Text>
                          </View>
                          <View style={styles.metricGridItem}>
                            <Text style={styles.gridItemLabel}>REPAYMENTS RECEIVED</Text>
                            <Text style={[styles.gridItemValue, { color: '#34D399' }]}>
                              {formatCurrency(personAnalysis?.totalRepaymentsReceivedPaise ?? 0)}
                            </Text>
                            <Text style={styles.gridItemSub}>Received back</Text>
                          </View>
                          <View style={styles.metricGridItem}>
                            <Text style={styles.gridItemLabel}>TOTAL BORROWED</Text>
                            <Text style={[styles.gridItemValue, { color: Colors.expense }]}>
                              {formatCurrency(personAnalysis?.totalBorrowedPaise ?? 0)}
                            </Text>
                            <Text style={styles.gridItemSub}>Principal borrowed</Text>
                          </View>
                          <View style={styles.metricGridItem}>
                            <Text style={styles.gridItemLabel}>REPAYMENTS MADE</Text>
                            <Text style={[styles.gridItemValue, { color: '#FBBF24' }]}>
                              {formatCurrency(personAnalysis?.totalRepaymentsMadePaise ?? 0)}
                            </Text>
                            <Text style={styles.gridItemSub}>Paid back</Text>
                          </View>
                        </View>
                      </View>

                      {/* Monthly Analytics & Period Selector */}
                      <View style={styles.analysisCard}>
                        <View style={styles.analysisCardHeader}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                          <Text style={styles.analysisCardTitle}>Monthly Analytics</Text>
                        </View>

                        {/* Date Range Selector Pills */}
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          style={styles.periodPillsScroll}
                        >
                          {(
                            [
                              { id: '30d', label: 'Last 30 Days' },
                              { id: 'this_month', label: 'Current Month' },
                              { id: 'last_month', label: 'Previous Month' },
                              { id: '6m', label: 'Last 6 Months' },
                              { id: '12m', label: 'Last 12 Months' },
                              { id: 'custom', label: 'Custom Range' },
                            ] as const
                          ).map((p) => {
                            const isActive = selectedPeriodPreset === p.id;
                            return (
                              <TouchableOpacity
                                key={p.id}
                                style={[styles.periodPill, isActive && styles.periodPillActive]}
                                onPress={() => handleSelectPeriodPreset(p.id)}
                              >
                                <Text
                                  style={[
                                    styles.periodPillText,
                                    isActive && styles.periodPillTextActive,
                                  ]}
                                >
                                  {p.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>

                        {/* Selected Period Activity Summary */}
                        {periodAnalytics ? (
                          <>
                            <View style={styles.periodHeaderBanner}>
                              <Text style={styles.periodHeaderTitle}>
                                Activity in {periodAnalytics.periodLabel}
                              </Text>
                              <Text style={styles.periodHeaderDates}>
                                {formatDate(periodAnalytics.startDate)} – {formatDate(periodAnalytics.endDate)}
                              </Text>
                            </View>

                            <View style={styles.metricGrid2x2}>
                              <View style={styles.metricGridItem}>
                                <Text style={styles.gridItemLabel}>NEW LENDING</Text>
                                <Text style={[styles.gridItemValue, { color: Colors.income }]}>
                                  {formatCurrency(periodAnalytics.newLentPaise)}
                                </Text>
                                <Text style={styles.gridItemSub}>Lent during period</Text>
                              </View>
                              <View style={styles.metricGridItem}>
                                <Text style={styles.gridItemLabel}>REPAYMENTS RECEIVED</Text>
                                <Text style={[styles.gridItemValue, { color: '#34D399' }]}>
                                  {formatCurrency(periodAnalytics.repaymentsReceivedPaise)}
                                </Text>
                                <Text style={styles.gridItemSub}>Received during period</Text>
                              </View>
                              <View style={styles.metricGridItem}>
                                <Text style={styles.gridItemLabel}>NEW BORROWING</Text>
                                <Text style={[styles.gridItemValue, { color: Colors.expense }]}>
                                  {formatCurrency(periodAnalytics.newBorrowedPaise)}
                                </Text>
                                <Text style={styles.gridItemSub}>Borrowed during period</Text>
                              </View>
                              <View style={styles.metricGridItem}>
                                <Text style={styles.gridItemLabel}>REPAYMENTS MADE</Text>
                                <Text style={[styles.gridItemValue, { color: '#FBBF24' }]}>
                                  {formatCurrency(periodAnalytics.repaymentsMadePaise)}
                                </Text>
                                <Text style={styles.gridItemSub}>Repaid during period</Text>
                              </View>
                            </View>

                            <Text style={styles.periodDistinctionNote}>
                              * Metrics above indicate activity within the selected period.
                              Current outstanding balances reflect all-time unpaid principal.
                            </Text>

                            {/* Monthly Trend Chart */}
                            <Text style={styles.chartSectionTitle}>Monthly Trend Activity</Text>
                            <PersonTrendChart breakdown={periodAnalytics.monthlyBreakdown} />
                          </>
                        ) : null}
                      </View>
                    </>
                  )}
                </ScrollView>
              )}

              {/* ─── TAB 3: TIMELINE ────────────────────────────────────────────────────── */}
              {personDetailTab === 'timeline' && (
                <View style={{ flex: 1 }}>
                  {/* Filter Chips */}
                  <View style={styles.timelineFilterBar}>
                    {(
                      [
                        { id: 'all', label: 'All' },
                        { id: 'lent', label: 'Lent' },
                        { id: 'borrowed', label: 'Borrowed' },
                        { id: 'repayment_received', label: 'Received' },
                        { id: 'repayment_made', label: 'Paid' },
                      ] as const
                    ).map((f) => {
                      const isActive = timelineFilterType === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={[styles.timelineChip, isActive && styles.timelineChipActive]}
                          onPress={() => handleSelectTimelineFilter(f.id)}
                        >
                          <Text
                            style={[
                              styles.timelineChipText,
                              isActive && styles.timelineChipTextActive,
                            ]}
                          >
                            {f.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {loadingTimeline ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={styles.loadingText}>Loading history timeline...</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={timelineEvents}
                      keyExtractor={(item) => item.id}
                      contentContainerStyle={styles.timelineListContent}
                      showsVerticalScrollIndicator={false}
                      renderItem={({ item }) => {
                        const isLent = item.type === 'lent';
                        const isBorrowed = item.type === 'borrowed';
                        const isReceived = item.type === 'repayment_received';

                        const badgeColor = isLent
                          ? Colors.income
                          : isBorrowed
                          ? Colors.expense
                          : isReceived
                          ? '#34D399'
                          : '#FBBF24';

                        const badgeBg = isLent
                          ? 'rgba(74, 222, 128, 0.15)'
                          : isBorrowed
                          ? 'rgba(251, 113, 133, 0.15)'
                          : isReceived
                          ? 'rgba(52, 211, 153, 0.15)'
                          : 'rgba(251, 191, 36, 0.15)';

                        const badgeLabel = isLent
                          ? 'YOU LENT'
                          : isBorrowed
                          ? 'YOU BORROWED'
                          : isReceived
                          ? 'REPAYMENT RECEIVED'
                          : 'REPAYMENT PAID';

                        const iconName = isLent
                          ? 'arrow-down-circle'
                          : isBorrowed
                          ? 'arrow-up-circle'
                          : isReceived
                          ? 'checkmark-circle'
                          : 'checkmark-done-circle';

                        return (
                          <View style={styles.timelineCard}>
                            <View style={styles.timelineCardTop}>
                              <View style={[styles.timelineBadge, { backgroundColor: badgeBg }]}>
                                <Ionicons name={iconName as any} size={13} color={badgeColor} />
                                <Text style={[styles.timelineBadgeText, { color: badgeColor }]}>
                                  {badgeLabel}
                                </Text>
                              </View>
                              <Text style={styles.timelineDateText}>{formatDate(item.date)}</Text>
                            </View>

                            <View style={styles.timelineAmountRow}>
                              <Text style={[styles.timelineAmount, { color: badgeColor }]}>
                                {isLent || isReceived ? '+' : '-'}
                                {formatCurrency(item.amountPaise)}
                              </Text>
                              <Text style={styles.timelineLoanDesc} numberOfLines={1}>
                                {item.loanDescription}
                              </Text>
                            </View>

                            <Text style={styles.timelineMetaText}>
                              via {item.accountName}
                              {item.notes ? ` • ${item.notes}` : ''}
                            </Text>

                            {/* Running Balance after event */}
                            <View style={styles.timelineRunningBox}>
                              <Text style={styles.timelineRunningLabel}>
                                Loan balance after event:
                              </Text>
                              <Text style={styles.timelineRunningVal}>
                                {formatCurrency(item.loanOutstandingAfterPaise)}
                                {item.loanOutstandingAfterPaise === 0 ? ' (Settled)' : ''}
                              </Text>
                            </View>
                          </View>
                        );
                      }}
                      ListEmptyComponent={
                        <View style={styles.emptyCard}>
                          <Ionicons name="time-outline" size={36} color={Colors.textDisabled} />
                          <Text style={styles.emptyTitle}>No Timeline Events</Text>
                          <Text style={styles.emptySubtitle}>
                            No loans or repayments found for the selected filter.
                          </Text>
                        </View>
                      }
                    />
                  )}
                </View>
              )}

              {/* Bottom Fixed Button: Add Loan for this person */}
              <View style={styles.bottomBar}>
                <TouchableOpacity
                  style={styles.addLoanForPersonBtn}
                  onPress={() => openNewLoanModal(selectedPerson.id)}
                >
                  <Ionicons name="add" size={20} color="#000" />
                  <Text style={styles.addLoanForPersonText}>
                    Add Loan with {selectedPerson.name}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </SafeAreaView>
      </Modal>

      {/* ──────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 1B: Custom Date Range Picker */}
      {/* ──────────────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showCustomDateModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowCustomDateModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Custom Date Range</Text>
              <TouchableOpacity onPress={() => setShowCustomDateModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.formLabel}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.formInput}
              value={customStartDate}
              onChangeText={setCustomStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textDisabled}
            />

            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>
              End Date (YYYY-MM-DD)
            </Text>
            <TextInput
              style={styles.formInput}
              value={customEndDate}
              onChangeText={setCustomEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textDisabled}
            />

            <TouchableOpacity
              style={[styles.saveSubmitBtn, { marginTop: Spacing.lg }]}
              onPress={handleApplyCustomPeriod}
            >
              <Text style={styles.saveSubmitText}>Apply Date Range</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>


      {/* ──────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: Add / Edit Person */}
      {/* ──────────────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showPersonModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPersonModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {editingPersonId ? 'Edit Person' : 'Add New Person'}
              </Text>
              <TouchableOpacity onPress={() => setShowPersonModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {personError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.expense} />
                <Text style={styles.errorText}>{personError}</Text>
              </View>
            ) : null}

            <Text style={styles.formLabel}>Full Name *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Rahul Sharma"
              placeholderTextColor={Colors.textDisabled}
              value={personName}
              onChangeText={setPersonName}
            />

            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>
              Phone Number (Optional)
            </Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={Colors.textDisabled}
              keyboardType="phone-pad"
              value={personPhone}
              onChangeText={setPersonPhone}
            />

            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Notes (Optional)</Text>
            <TextInput
              style={[styles.formInput, { minHeight: 60 }]}
              placeholder="Notes or relationship"
              placeholderTextColor={Colors.textDisabled}
              multiline
              value={personNotes}
              onChangeText={setPersonNotes}
            />

            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Avatar Color</Text>
            <View style={styles.colorPickerRow}>
              {AVATAR_COLORS.slice(0, 8).map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: c },
                    personColor === c && styles.colorCircleSelected,
                  ]}
                  onPress={() => setPersonColor(c)}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.saveSubmitBtn} onPress={handleSavePerson}>
              <Text style={styles.saveSubmitText}>Save Person</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ──────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 3: New Loan */}
      {/* ──────────────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showLoanModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLoanModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.scrollSheetContent}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Record Loan</Text>
              <TouchableOpacity onPress={() => setShowLoanModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loanError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.expense} />
                <Text style={styles.errorText}>{loanError}</Text>
              </View>
            ) : null}

            {/* Direction Selector: Lent vs Borrowed */}
            <View style={styles.loanTypeSwitch}>
              <TouchableOpacity
                style={[styles.loanTypeOption, loanType === 'lent' && styles.loanTypeLentActive]}
                onPress={() => setLoanType('lent')}
              >
                <Ionicons
                  name="arrow-down-circle"
                  size={16}
                  color={loanType === 'lent' ? '#000' : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.loanTypeOptionText,
                    loanType === 'lent' && styles.loanTypeOptionTextActive,
                  ]}
                >
                  Money Lent (Receivable)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.loanTypeOption,
                  loanType === 'borrowed' && styles.loanTypeBorrowedActive,
                ]}
                onPress={() => setLoanType('borrowed')}
              >
                <Ionicons
                  name="arrow-up-circle"
                  size={16}
                  color={loanType === 'borrowed' ? '#000' : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.loanTypeOptionText,
                    loanType === 'borrowed' && styles.loanTypeOptionTextActive,
                  ]}
                >
                  Money Borrowed (Payable)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Person Selector */}
            <Text style={styles.formLabel}>Person *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {people.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.personChip,
                    loanPersonId === p.id && {
                      borderColor: p.avatarColor,
                      backgroundColor: '#27272A',
                    },
                  ]}
                  onPress={() => setLoanPersonId(p.id)}
                >
                  <View style={[styles.avatarMini, { backgroundColor: p.avatarColor }]} />
                  <Text
                    style={[
                      styles.personChipText,
                      loanPersonId === p.id && styles.personChipTextActive,
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Amount */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Amount *</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencyPrefix}>₹</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={Colors.textDisabled}
                keyboardType="decimal-pad"
                value={loanAmountStr}
                onChangeText={setLoanAmountStr}
              />
            </View>

            {/* Account Selector */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>
              {loanType === 'lent' ? 'Paid From Account *' : 'Received Into Account *'}
            </Text>
            <View style={styles.chipRow}>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.accountChip,
                    loanAccountId === acc.id && {
                      borderColor: acc.color,
                      backgroundColor: '#27272A',
                    },
                  ]}
                  onPress={() => setLoanAccountId(acc.id)}
                >
                  <View style={[styles.accountDot, { backgroundColor: acc.color }]} />
                  <Text
                    style={[
                      styles.accountChipText,
                      loanAccountId === acc.id && styles.accountChipTextActive,
                    ]}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Description *</Text>
            <TextInput
              style={styles.formInput}
              placeholder={
                loanType === 'lent'
                  ? 'e.g. Lent for concert tickets'
                  : 'e.g. Borrowed for home repair'
              }
              placeholderTextColor={Colors.textDisabled}
              value={loanDescription}
              onChangeText={setLoanDescription}
            />

            {/* Date & Optional Due Date */}
            <View style={styles.datesRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Date *</Text>
                <TextInput
                  style={styles.formInput}
                  value={loanDate}
                  onChangeText={setLoanDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textDisabled}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Due Date (Optional)</Text>
                <TextInput
                  style={styles.formInput}
                  value={loanDueDate}
                  onChangeText={setLoanDueDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.textDisabled}
                />
              </View>
            </View>

            {/* Note */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Notes (Optional)</Text>
            <TextInput
              style={[styles.formInput, { minHeight: 60 }]}
              placeholder="Any additional notes"
              placeholderTextColor={Colors.textDisabled}
              multiline
              value={loanNote}
              onChangeText={setLoanNote}
            />

            <TouchableOpacity
              style={[styles.saveSubmitBtn, isSavingLoan && styles.btnDisabled]}
              onPress={handleSaveLoan}
              disabled={isSavingLoan}
            >
              {isSavingLoan ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.saveSubmitText}>Save Loan</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ──────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL 4: Record Repayment */}
      {/* ──────────────────────────────────────────────────────────────────────────── */}
      <Modal
        visible={showRepaymentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRepaymentModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Record Repayment</Text>
              <TouchableOpacity onPress={() => setShowRepaymentModal(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {repaymentLoan ? (
              <View style={styles.repayLoanSummary}>
                <Text style={styles.repayLoanDesc}>{repaymentLoan.description}</Text>
                <Text style={styles.repayLoanPerson}>
                  {repaymentLoan.type === 'lent'
                    ? `From: ${repaymentLoan.personName}`
                    : `To: ${repaymentLoan.personName}`}
                </Text>
                <Text style={styles.repayOutstandingNote}>
                  Outstanding Balance:{' '}
                  <Text style={{ fontWeight: FontWeight.bold, color: Colors.primary }}>
                    {formatCurrency(repaymentLoan.outstandingPaise)}
                  </Text>
                </Text>
              </View>
            ) : null}

            {repaymentError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={Colors.expense} />
                <Text style={styles.errorText}>{repaymentError}</Text>
              </View>
            ) : null}

            {/* Amount */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: Spacing.sm,
              }}
            >
              <Text style={styles.formLabel}>Repayment Amount *</Text>
              {repaymentLoan ? (
                <TouchableOpacity
                  onPress={() =>
                    setRepaymentAmountStr((repaymentLoan.outstandingPaise / 100).toFixed(2))
                  }
                >
                  <Text style={styles.fullAmountLink}>Full Repayment</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.amountInputRow}>
              <Text style={styles.currencyPrefix}>₹</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={Colors.textDisabled}
                keyboardType="decimal-pad"
                value={repaymentAmountStr}
                onChangeText={setRepaymentAmountStr}
              />
            </View>

            {/* Account Selector */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>
              {repaymentLoan?.type === 'lent'
                ? 'Deposit Into Account *'
                : 'Withdraw From Account *'}
            </Text>
            <View style={styles.chipRow}>
              {accounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.accountChip,
                    repaymentAccountId === acc.id && {
                      borderColor: acc.color,
                      backgroundColor: '#27272A',
                    },
                  ]}
                  onPress={() => setRepaymentAccountId(acc.id)}
                >
                  <View style={[styles.accountDot, { backgroundColor: acc.color }]} />
                  <Text
                    style={[
                      styles.accountChipText,
                      repaymentAccountId === acc.id && styles.accountChipTextActive,
                    ]}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Date *</Text>
            <TextInput
              style={styles.formInput}
              value={repaymentDate}
              onChangeText={setRepaymentDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textDisabled}
            />

            {/* Notes */}
            <Text style={[styles.formLabel, { marginTop: Spacing.md }]}>Notes (Optional)</Text>
            <TextInput
              style={[styles.formInput, { minHeight: 50 }]}
              placeholder="e.g. Paid via UPI"
              placeholderTextColor={Colors.textDisabled}
              value={repaymentNote}
              onChangeText={setRepaymentNote}
            />

            <TouchableOpacity
              style={[styles.saveSubmitBtn, isSavingRepayment && styles.btnDisabled]}
              onPress={handleSaveRepayment}
              disabled={isSavingRepayment}
            >
              {isSavingRepayment ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.saveSubmitText}>Confirm Repayment</Text>
              )}
            </TouchableOpacity>
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
  headerTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  addPersonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: 4,
  },
  addPersonText: {
    color: '#000',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCardActiveLent: {
    borderColor: Colors.income,
    backgroundColor: '#1E2822',
  },
  summaryCardActiveBorrowed: {
    borderColor: Colors.expense,
    backgroundColor: '#281E22',
  },
  summaryTop: {
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
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  tabChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabChipActive: {
    backgroundColor: '#27272A',
    borderColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.xs,
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
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 90,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  personInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  personName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  personPhone: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  loanCounts: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  personAmounts: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amountPill: {
    alignItems: 'flex-end',
  },
  pillLabel: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
  },
  pillAmount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  settledBadge: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
    fontWeight: FontWeight.medium,
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
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 40,
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
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  emptyActionText: {
    color: '#000',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  fab: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 6,
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  /* Modal 1: Person Detail */
  modalSafe: { flex: 1, backgroundColor: Colors.background },
  modalFullContainer: { flex: 1 },
  modalHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCloseBtn: { padding: Spacing.xs },
  modalHeaderTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  modalEditBtn: { padding: Spacing.xs },
  personHeaderCard: {
    backgroundColor: Colors.card,
    margin: Spacing.lg,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  personHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginRight: Spacing.md,
  },
  avatarLargeText: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
  },
  personHeaderInfo: { flex: 1 },
  personHeaderName: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  personHeaderPhone: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  personHeaderNotes: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
    marginTop: 2,
  },
  personSplitRow: {
    flexDirection: 'row',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  splitBox: { flex: 1, alignItems: 'center' },
  splitLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  splitAmount: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  splitDivider: {
    width: 1,
    height: '100%',
    backgroundColor: Colors.border,
  },
  personSubTabSwitch: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  personSubTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.sm,
    gap: 5,
  },
  personSubTabBtnActive: {
    backgroundColor: Colors.primary,
  },
  personSubTabText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  personSubTabTextActive: {
    color: '#000',
    fontWeight: FontWeight.bold,
  },
  settledBadgeTag: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  settledBadgeTagText: {
    color: Colors.income,
    fontSize: 9,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },

  /* Analysis Tab Styles */
  analysisScrollView: { flex: 1 },
  analysisContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 110,
  },
  netBanner: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  netBannerReceivable: {
    backgroundColor: '#13231B',
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  netBannerPayable: {
    backgroundColor: '#27171B',
    borderColor: 'rgba(251, 113, 133, 0.3)',
  },
  netBannerSettled: {
    backgroundColor: Colors.card,
    borderColor: Colors.border,
  },
  netBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  netBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  netBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  netFormulaNote: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  netAmount: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginVertical: 4,
  },
  netDescription: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  analysisCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  analysisCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  analysisCardTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  analysisCardSub: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  twoColumnGrid: {
    flexDirection: 'row',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  columnBox: {
    flex: 1,
    alignItems: 'center',
  },
  columnDivider: {
    width: 1,
    height: '100%',
    backgroundColor: Colors.border,
  },
  columnLabel: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  columnValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  columnMeta: {
    fontSize: 10,
    color: Colors.textDisabled,
    marginTop: 2,
  },
  metricGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricGridItem: {
    width: '48%',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gridItemLabel: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.textDisabled,
    letterSpacing: 0.5,
  },
  gridItemValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    marginVertical: 2,
  },
  gridItemSub: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  periodPillsScroll: {
    marginBottom: Spacing.md,
  },
  periodPill: {
    backgroundColor: Colors.inputBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  periodPillText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  periodPillTextActive: {
    color: '#000',
    fontWeight: FontWeight.bold,
  },
  periodHeaderBanner: {
    backgroundColor: '#27272A',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  periodHeaderTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  periodHeaderDates: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  periodDistinctionNote: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chartSectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },

  /* Timeline Tab Styles */
  timelineFilterBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  timelineChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timelineChipActive: {
    backgroundColor: '#27272A',
    borderColor: Colors.primary,
  },
  timelineChipText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  timelineChipTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  timelineListContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 110,
  },
  timelineCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timelineCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  timelineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
    gap: 4,
  },
  timelineBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  timelineDateText: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
  },
  timelineAmountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  timelineAmount: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  timelineLoanDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    maxWidth: '55%',
  },
  timelineMetaText: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
    marginBottom: Spacing.xs,
  },
  timelineRunningBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.inputBg,
    borderRadius: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    marginTop: 4,
  },
  timelineRunningLabel: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  timelineRunningVal: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },

  loanTabSwitch: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  loanTabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: Radius.sm,
  },
  loanTabBtnActive: {
    backgroundColor: '#27272A',
  },
  loanTabText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  loanTabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  loansListContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 100,
  },
  loanCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loanCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
  },
  badgeLent: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
  },
  badgeBorrowed: {
    backgroundColor: 'rgba(251, 113, 133, 0.15)',
  },
  directionBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  loanDescription: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  loanAccountMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  loanAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  loanAmountSub: {
    fontSize: 10,
    color: Colors.textDisabled,
    textTransform: 'uppercase',
  },
  loanPrincipal: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  loanOutstanding: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.inputBg,
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  repaidMeta: {
    fontSize: 10,
    color: Colors.textDisabled,
    marginBottom: Spacing.md,
  },
  loanActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  repayButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  repayButtonText: {
    color: '#000',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  historyToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  historyToggleText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  repaymentsHistoryBox: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  repaymentsHistoryTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  repaymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  repaymentAmount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.income,
  },
  repaymentAccount: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  repaymentDate: {
    fontSize: 10,
    color: Colors.textDisabled,
  },
  noRepaymentsText: {
    fontSize: FontSize.xs,
    color: Colors.textDisabled,
    fontStyle: 'italic',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  addLoanForPersonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    gap: 6,
  },
  addLoanForPersonText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  /* Modals Common */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
  },
  scrollSheetContent: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  sheetTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  formLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
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
  colorPickerRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginVertical: Spacing.xs,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  saveSubmitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  saveSubmitText: {
    color: '#000',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  btnDisabled: { opacity: 0.6 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 113, 133, 0.15)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  errorText: {
    color: Colors.expense,
    fontSize: FontSize.sm,
    flex: 1,
  },
  loanTypeSwitch: {
    flexDirection: 'row',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    padding: 3,
    marginBottom: Spacing.lg,
  },
  loanTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    gap: 6,
  },
  loanTypeLentActive: {
    backgroundColor: Colors.income,
  },
  loanTypeBorrowedActive: {
    backgroundColor: Colors.expense,
  },
  loanTypeOptionText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.bold,
  },
  loanTypeOptionTextActive: {
    color: '#000',
  },
  chipScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    marginRight: Spacing.sm,
    gap: 6,
  },
  avatarMini: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  personChipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  personChipTextActive: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  currencyPrefix: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    marginRight: Spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginVertical: 4,
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
    gap: 6,
  },
  accountDot: { width: 8, height: 8, borderRadius: 4 },
  accountChipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  accountChipTextActive: { color: Colors.textPrimary, fontWeight: FontWeight.bold },
  datesRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md },
  repayLoanSummary: {
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  repayLoanDesc: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  repayLoanPerson: { fontSize: FontSize.xs, color: Colors.textSecondary, marginVertical: 2 },
  repayOutstandingNote: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 4 },
  fullAmountLink: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold },
});
