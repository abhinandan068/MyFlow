/**
 * Modular Income vs Expense Trend Chart — MyFlow
 * Renders monthly income vs expense comparison bars using react-native-svg.
 * Fully compatible with Expo SDK 58, zero extra native dependencies,
 * Obsidian Minimal Dark theme.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Platform } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { IncomeExpenseTrend } from '@/types';
import { Ionicons } from '@expo/vector-icons';

interface IncomeExpenseTrendChartProps {
  trends: IncomeExpenseTrend[];
}

export const IncomeExpenseTrendChart: React.FC<IncomeExpenseTrendChartProps> = ({ trends }) => {
  const [containerWidth, setContainerWidth] = useState<number>(320);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setContainerWidth(w);
    }
  };

  const hasAnyActivity = trends.some((t) => t.incomePaise > 0 || t.expensePaise > 0);

  if (!hasAnyActivity || trends.length === 0) {
    return (
      <View style={styles.emptyContainer} onLayout={handleLayout}>
        <Ionicons name="bar-chart-outline" size={32} color={Colors.textDisabled} />
        <Text style={styles.emptyText}>No cash flow activity in this period</Text>
        <Text style={styles.emptySubtext}>
          Income and expenses recorded in this date range will appear here.
        </Text>
      </View>
    );
  }

  const chartHeight = 160;
  const paddingLeft = 44;
  const paddingRight = 16;
  const paddingTop = 20;
  const paddingBottom = 30;
  const availableWidth = Math.max(containerWidth - paddingLeft - paddingRight, 100);
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  let maxPaise = 0;
  for (const t of trends) {
    if (t.incomePaise > maxPaise) maxPaise = t.incomePaise;
    if (t.expensePaise > maxPaise) maxPaise = t.expensePaise;
  }
  if (maxPaise === 0) maxPaise = 10000;

  const gridSteps = [0, maxPaise * 0.5, maxPaise];
  const numMonths = trends.length;
  const slotWidth = availableWidth / numMonths;

  const maxGroupWidth = slotWidth * 0.7;
  const barWidth = Math.max(4, Math.min(14, maxGroupWidth / 2));
  const groupOffset = (slotWidth - barWidth * 2) / 2;

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
      {/* Legend */}
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.income }]} />
          <Text style={styles.legendLabel}>Income</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.expense }]} />
          <Text style={styles.legendLabel}>Expenses</Text>
        </View>
      </View>

      {/* SVG Plot */}
      <View style={styles.chartWrapper}>
        <Svg width={containerWidth} height={chartHeight}>
          {/* Horizontal Grid lines */}
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

          {/* Grouped Month Bars */}
          {trends.map((t, i) => {
            const slotX = paddingLeft + i * slotWidth;

            return (
              <G key={`trend-${t.month}`}>
                {/* Income Bar */}
                {t.incomePaise > 0 && (
                  <Rect
                    x={slotX + groupOffset}
                    y={getY(t.incomePaise)}
                    width={barWidth}
                    height={getBarH(t.incomePaise)}
                    fill={Colors.income}
                    rx={2}
                  />
                )}

                {/* Expense Bar */}
                {t.expensePaise > 0 && (
                  <Rect
                    x={slotX + groupOffset + barWidth + 2}
                    y={getY(t.expensePaise)}
                    width={barWidth}
                    height={getBarH(t.expensePaise)}
                    fill={Colors.expense}
                    rx={2}
                  />
                )}

                {/* X Axis Month Label */}
                <SvgText
                  x={slotX + slotWidth / 2}
                  y={chartHeight - 8}
                  fill={Colors.textSecondary}
                  fontSize={numMonths > 6 ? 9 : 10}
                  textAnchor="middle"
                >
                  {numMonths > 6 ? t.month.slice(5) : t.monthLabel}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
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
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
