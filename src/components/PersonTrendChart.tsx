/**
 * Modular Person Trend Chart — MyFlow
 * Renders monthly lending and borrowing activity trends using react-native-svg.
 * Fully compatible with Expo SDK 58, zero extra native dependencies,
 * Obsidian Minimal Dark theme.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent, Platform } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { PersonMonthlyBreakdown } from '@/types';
import { formatCurrency } from '@/utils/currency';
import { Ionicons } from '@expo/vector-icons';

interface PersonTrendChartProps {
  breakdown: PersonMonthlyBreakdown[];
}

type ChartMetric = 'all' | 'lending' | 'borrowing';

export const PersonTrendChart: React.FC<PersonTrendChartProps> = ({ breakdown }) => {
  const [metricMode, setMetricMode] = useState<ChartMetric>('all');
  const [containerWidth, setContainerWidth] = useState<number>(320);
  const [selectedMonth, setSelectedMonth] = useState<PersonMonthlyBreakdown | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setContainerWidth(w);
    }
  };

  // Check if there is any activity across all months
  const hasAnyActivity = breakdown.some(
    (b) =>
      b.lentPaise > 0 ||
      b.borrowedPaise > 0 ||
      b.repaymentsReceivedPaise > 0 ||
      b.repaymentsMadePaise > 0
  );

  if (!hasAnyActivity || breakdown.length === 0) {
    return (
      <View style={styles.emptyContainer} onLayout={handleLayout}>
        <Ionicons name="bar-chart-outline" size={32} color={Colors.textDisabled} />
        <Text style={styles.emptyText}>No activity recorded in this period</Text>
        <Text style={styles.emptySubtext}>
          Loans and repayments created within these dates will appear here.
        </Text>
      </View>
    );
  }

  // Chart dimensions
  const chartHeight = 160;
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 30;
  const availableWidth = Math.max(containerWidth - paddingLeft - paddingRight, 100);
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  // Compute maximum value based on active mode
  let maxPaise = 0;
  for (const b of breakdown) {
    if (metricMode === 'all') {
      const highest = Math.max(
        b.lentPaise,
        b.borrowedPaise,
        b.repaymentsReceivedPaise,
        b.repaymentsMadePaise
      );
      if (highest > maxPaise) maxPaise = highest;
    } else if (metricMode === 'lending') {
      const highest = Math.max(b.lentPaise, b.repaymentsReceivedPaise);
      if (highest > maxPaise) maxPaise = highest;
    } else {
      const highest = Math.max(b.borrowedPaise, b.repaymentsMadePaise);
      if (highest > maxPaise) maxPaise = highest;
    }
  }

  if (maxPaise === 0) maxPaise = 10000; // Baseline ₹100 if all zero in current mode

  // Grid steps (3 horizontal levels)
  const gridSteps = [0, maxPaise * 0.5, maxPaise];

  // Bar calculations
  const numMonths = breakdown.length;
  const slotWidth = availableWidth / numMonths;

  // Width of each individual bar within slot
  const barsPerSlot = metricMode === 'all' ? 4 : 2;
  const maxSlotBarGroupWidth = slotWidth * 0.75;
  const barWidth = Math.max(3, Math.min(12, maxSlotBarGroupWidth / barsPerSlot));
  const groupOffset = (slotWidth - barWidth * barsPerSlot) / 2;

  const getY = (valPaise: number) => {
    const ratio = Math.min(valPaise / maxPaise, 1);
    return paddingTop + plotHeight - ratio * plotHeight;
  };

  const getBarH = (valPaise: number) => {
    const ratio = Math.min(valPaise / maxPaise, 1);
    return Math.max(2, ratio * plotHeight);
  };

  return (
    <View style={styles.card} onLayout={handleLayout}>
      {/* Chart Mode Selector */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, metricMode === 'all' && styles.modeChipActive]}
          onPress={() => {
            setMetricMode('all');
            setSelectedMonth(null);
          }}
        >
          <Text style={[styles.modeChipText, metricMode === 'all' && styles.modeChipTextActive]}>
            All Activity
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, metricMode === 'lending' && styles.modeChipActive]}
          onPress={() => {
            setMetricMode('lending');
            setSelectedMonth(null);
          }}
        >
          <Text
            style={[
              styles.modeChipText,
              metricMode === 'lending' && styles.modeChipTextActive,
            ]}
          >
            Lending & Inflows
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, metricMode === 'borrowing' && styles.modeChipActive]}
          onPress={() => {
            setMetricMode('borrowing');
            setSelectedMonth(null);
          }}
        >
          <Text
            style={[
              styles.modeChipText,
              metricMode === 'borrowing' && styles.modeChipTextActive,
            ]}
          >
            Borrowing & Outflows
          </Text>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legendRow}>
        {(metricMode === 'all' || metricMode === 'lending') && (
          <>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.income }]} />
              <Text style={styles.legendLabel}>Lent</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#34D399' }]} />
              <Text style={styles.legendLabel}>Repaid to You</Text>
            </View>
          </>
        )}
        {(metricMode === 'all' || metricMode === 'borrowing') && (
          <>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: Colors.expense }]} />
              <Text style={styles.legendLabel}>Borrowed</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FBBF24' }]} />
              <Text style={styles.legendLabel}>Repaid by You</Text>
            </View>
          </>
        )}
      </View>

      {/* SVG Chart */}
      <View style={styles.chartWrapper}>
        <Svg width={containerWidth} height={chartHeight}>
          {/* Horizontal Grid lines & Y Axis labels */}
          {gridSteps.map((val, idx) => {
            const y = getY(val);
            const labelText =
              val >= 10000000
                ? `₹${(val / 10000000).toFixed(1)}Cr`
                : val >= 100000
                ? `₹${(val / 100000).toFixed(0)}k`
                : `₹${(val / 100).toFixed(0)}`;

            return (
              <G key={`grid-${idx}`}>
                <Line
                  x1={paddingLeft}
                  y1={y}
                  x2={containerWidth - paddingRight}
                  y2={y}
                  stroke="#27272A"
                  strokeDasharray="4,4"
                  strokeWidth={1}
                />
                <SvgText
                  x={paddingLeft - 6}
                  y={y + 4}
                  fill={Colors.textDisabled}
                  fontSize={10}
                  textAnchor="end"
                  fontFamily={Platform.select({ ios: 'Menlo', default: 'monospace' })}
                >
                  {labelText}
                </SvgText>
              </G>
            );
          })}

          {/* Month Bars & X Axis labels */}
          {breakdown.map((b, i) => {
            const slotX = paddingLeft + i * slotWidth;
            const isSelected = selectedMonth?.month === b.month;

            return (
              <G key={`slot-${b.month}`}>
                {/* Optional highlight background for selected month */}
                {isSelected && (
                  <Rect
                    x={slotX + 1}
                    y={paddingTop}
                    width={slotWidth - 2}
                    height={plotHeight}
                    fill="rgba(181, 160, 255, 0.08)"
                    rx={3}
                  />
                )}

                {/* Bars based on metric mode */}
                {metricMode === 'all' && (
                  <>
                    {/* Lent Bar */}
                    {b.lentPaise > 0 && (
                      <Rect
                        x={slotX + groupOffset}
                        y={getY(b.lentPaise)}
                        width={barWidth}
                        height={getBarH(b.lentPaise)}
                        fill={Colors.income}
                        rx={2}
                      />
                    )}
                    {/* Received Bar */}
                    {b.repaymentsReceivedPaise > 0 && (
                      <Rect
                        x={slotX + groupOffset + barWidth}
                        y={getY(b.repaymentsReceivedPaise)}
                        width={barWidth}
                        height={getBarH(b.repaymentsReceivedPaise)}
                        fill="#34D399"
                        rx={2}
                      />
                    )}
                    {/* Borrowed Bar */}
                    {b.borrowedPaise > 0 && (
                      <Rect
                        x={slotX + groupOffset + barWidth * 2}
                        y={getY(b.borrowedPaise)}
                        width={barWidth}
                        height={getBarH(b.borrowedPaise)}
                        fill={Colors.expense}
                        rx={2}
                      />
                    )}
                    {/* Repaid Bar */}
                    {b.repaymentsMadePaise > 0 && (
                      <Rect
                        x={slotX + groupOffset + barWidth * 3}
                        y={getY(b.repaymentsMadePaise)}
                        width={barWidth}
                        height={getBarH(b.repaymentsMadePaise)}
                        fill="#FBBF24"
                        rx={2}
                      />
                    )}
                  </>
                )}

                {metricMode === 'lending' && (
                  <>
                    {/* Lent */}
                    {b.lentPaise > 0 && (
                      <Rect
                        x={slotX + groupOffset}
                        y={getY(b.lentPaise)}
                        width={barWidth}
                        height={getBarH(b.lentPaise)}
                        fill={Colors.income}
                        rx={2}
                      />
                    )}
                    {/* Received */}
                    {b.repaymentsReceivedPaise > 0 && (
                      <Rect
                        x={slotX + groupOffset + barWidth}
                        y={getY(b.repaymentsReceivedPaise)}
                        width={barWidth}
                        height={getBarH(b.repaymentsReceivedPaise)}
                        fill="#34D399"
                        rx={2}
                      />
                    )}
                  </>
                )}

                {metricMode === 'borrowing' && (
                  <>
                    {/* Borrowed */}
                    {b.borrowedPaise > 0 && (
                      <Rect
                        x={slotX + groupOffset}
                        y={getY(b.borrowedPaise)}
                        width={barWidth}
                        height={getBarH(b.borrowedPaise)}
                        fill={Colors.expense}
                        rx={2}
                      />
                    )}
                    {/* Repaid */}
                    {b.repaymentsMadePaise > 0 && (
                      <Rect
                        x={slotX + groupOffset + barWidth}
                        y={getY(b.repaymentsMadePaise)}
                        width={barWidth}
                        height={getBarH(b.repaymentsMadePaise)}
                        fill="#FBBF24"
                        rx={2}
                      />
                    )}
                  </>
                )}

                {/* X Axis Month Label */}
                <SvgText
                  x={slotX + slotWidth / 2}
                  y={chartHeight - 8}
                  fill={isSelected ? Colors.primary : Colors.textSecondary}
                  fontSize={numMonths > 6 ? 9 : 10}
                  fontWeight={isSelected ? 'bold' : 'normal'}
                  textAnchor="middle"
                >
                  {numMonths > 6 ? b.month.slice(5) : b.monthLabel}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Selected month detail info if tapped */}
      {selectedMonth && (
        <View style={styles.selectedMonthCard}>
          <Text style={styles.selectedMonthTitle}>{selectedMonth.monthLabel} Summary</Text>
          <View style={styles.selectedMonthGrid}>
            <Text style={styles.selectedDetail}>
              Lent: <Text style={{ color: Colors.income }}>{formatCurrency(selectedMonth.lentPaise)}</Text>
            </Text>
            <Text style={styles.selectedDetail}>
              Received: <Text style={{ color: '#34D399' }}>{formatCurrency(selectedMonth.repaymentsReceivedPaise)}</Text>
            </Text>
            <Text style={styles.selectedDetail}>
              Borrowed: <Text style={{ color: Colors.expense }}>{formatCurrency(selectedMonth.borrowedPaise)}</Text>
            </Text>
            <Text style={styles.selectedDetail}>
              Repaid: <Text style={{ color: '#FBBF24' }}>{formatCurrency(selectedMonth.repaymentsMadePaise)}</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  emptyContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  modeRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  modeChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    backgroundColor: '#27272A',
  },
  modeChipActive: {
    backgroundColor: Colors.primary,
  },
  modeChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: FontWeight.medium,
  },
  modeChipTextActive: {
    color: '#000',
    fontWeight: FontWeight.bold,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedMonthCard: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  selectedMonthTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    marginBottom: 4,
  },
  selectedMonthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  selectedDetail: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
});
