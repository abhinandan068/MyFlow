/**
 * Modular Daily Spending Trend Chart — MyFlow
 * Renders daily expense bars with peaks using react-native-svg.
 * Fully compatible with Expo SDK 58, zero extra native dependencies,
 * Obsidian Minimal Dark theme.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Platform } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { DailySpendingTrend } from '@/types';
import { formatCurrency } from '@/utils/currency';
import { Ionicons } from '@expo/vector-icons';

interface DailySpendingChartProps {
  trends: DailySpendingTrend[];
}

export const DailySpendingChart: React.FC<DailySpendingChartProps> = ({ trends }) => {
  const [containerWidth, setContainerWidth] = useState<number>(320);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setContainerWidth(w);
    }
  };

  const hasAnyActivity = trends.some((d) => d.amountPaise > 0);

  if (!hasAnyActivity || trends.length === 0) {
    return (
      <View style={styles.emptyContainer} onLayout={handleLayout}>
        <Ionicons name="pulse-outline" size={32} color={Colors.textDisabled} />
        <Text style={styles.emptyText}>No daily spending recorded</Text>
        <Text style={styles.emptySubtext}>
          Expenses incurred on specific days in this range will appear here.
        </Text>
      </View>
    );
  }

  // If more than 30 data points, take the last 30 for clear display
  const displayTrends = trends.length > 30 ? trends.slice(-30) : trends;

  const chartHeight = 140;
  const paddingLeft = 44;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 26;
  const availableWidth = Math.max(containerWidth - paddingLeft - paddingRight, 100);
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  let maxPaise = 0;
  let maxDate = '';
  for (const d of displayTrends) {
    if (d.amountPaise > maxPaise) {
      maxPaise = d.amountPaise;
      maxDate = d.dateLabel;
    }
  }
  if (maxPaise === 0) maxPaise = 10000;

  const numDays = displayTrends.length;
  const slotWidth = availableWidth / numDays;
  const barWidth = Math.max(2, Math.min(10, slotWidth * 0.7));
  const groupOffset = (slotWidth - barWidth) / 2;

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
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Daily Spending Activity</Text>
        <Text style={styles.peakMeta}>
          Peak: <Text style={{ color: Colors.expense }}>{formatCurrency(maxPaise)}</Text> ({maxDate})
        </Text>
      </View>

      <View style={styles.chartWrapper}>
        <Svg width={containerWidth} height={chartHeight}>
          {/* Baseline and Midline */}
          {[0, maxPaise].map((val, idx) => {
            const y = getY(val);
            const labelText =
              val >= 10000000
                ? `₹${(val / 10000000).toFixed(1)}Cr`
                : val >= 100000
                ? `₹${(val / 100000).toFixed(0)}k`
                : `₹${(val / 100).toFixed(0)}`;

            return (
              <G key={`daily-grid-${idx}`}>
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

          {/* Daily Bars */}
          {displayTrends.map((d, i) => {
            const slotX = paddingLeft + i * slotWidth;
            const isPeak = d.amountPaise === maxPaise && maxPaise > 0;

            // Show label every few days to avoid crowding
            const showLabel =
              numDays <= 14 ||
              i === 0 ||
              i === Math.floor(numDays / 2) ||
              i === numDays - 1;

            return (
              <G key={`day-${d.date}`}>
                {d.amountPaise > 0 && (
                  <Rect
                    x={slotX + groupOffset}
                    y={getY(d.amountPaise)}
                    width={barWidth}
                    height={getBarH(d.amountPaise)}
                    fill={isPeak ? Colors.expense : 'rgba(251, 113, 133, 0.65)'}
                    rx={1.5}
                  />
                )}

                {showLabel && (
                  <SvgText
                    x={slotX + slotWidth / 2}
                    y={chartHeight - 6}
                    fill={Colors.textDisabled}
                    fontSize={9}
                    textAnchor="middle"
                  >
                    {d.date.slice(8)}
                  </SvgText>
                )}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  peakMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
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
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
