/**
 * Modular Category Breakdown Chart — MyFlow
 * Renders category proportion distribution using react-native-svg.
 * Fully compatible with Expo SDK 58, zero extra native dependencies,
 * Obsidian Minimal Dark theme.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { Colors, Spacing, FontSize, FontWeight, Radius } from '@/constants/theme';
import { CategorySpendingAnalysis } from '@/types';
import { formatCurrency } from '@/utils/currency';
import { Ionicons } from '@expo/vector-icons';

interface CategoryBreakdownChartProps {
  categories: CategorySpendingAnalysis[];
  totalExpensePaise: number;
  onSelectCategory?: (category: CategorySpendingAnalysis) => void;
}

export const CategoryBreakdownChart: React.FC<CategoryBreakdownChartProps> = ({
  categories,
  totalExpensePaise,
  onSelectCategory,
}) => {
  const [containerWidth, setContainerWidth] = useState<number>(320);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) {
      setContainerWidth(w);
    }
  };

  if (categories.length === 0 || totalExpensePaise === 0) {
    return (
      <View style={styles.emptyContainer} onLayout={handleLayout}>
        <Ionicons name="pie-chart-outline" size={32} color={Colors.textDisabled} />
        <Text style={styles.emptyText}>No category expenses recorded</Text>
        <Text style={styles.emptySubtext}>
          Expenses assigned to categories will form your distribution.
        </Text>
      </View>
    );
  }

  const barHeight = 12;
  const availableWidth = Math.max(containerWidth - Spacing.md * 2, 100);

  // Calculate cumulative widths for the proportion bar
  let currentX = 0;
  const segments = categories.map((cat) => {
    const ratio = cat.totalSpentPaise / totalExpensePaise;
    const width = Math.max(3, ratio * availableWidth);
    const seg = {
      ...cat,
      x: currentX,
      width,
    };
    currentX += width;
    return seg;
  });

  return (
    <View style={styles.card} onLayout={handleLayout}>
      <Text style={styles.cardTitle}>Spending by Category</Text>

      {/* Segmented Proportion Bar */}
      <View style={styles.barWrapper}>
        <Svg width={availableWidth} height={barHeight}>
          {segments.map((seg, idx) => (
            <Rect
              key={`seg-${seg.categoryId}-${idx}`}
              x={seg.x}
              y={0}
              width={seg.width}
              height={barHeight}
              fill={seg.categoryColor}
              rx={idx === 0 || idx === segments.length - 1 ? 6 : 0}
            />
          ))}
        </Svg>
      </View>

      {/* Category List */}
      <View style={styles.categoryList}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={`cat-item-${cat.categoryId}`}
            style={styles.categoryRow}
            onPress={() => onSelectCategory?.(cat)}
            activeOpacity={onSelectCategory ? 0.7 : 1}
          >
            <View style={styles.categoryLeft}>
              <View style={[styles.categoryDot, { backgroundColor: cat.categoryColor }]} />
              <View style={[styles.iconWrapper, { backgroundColor: `${cat.categoryColor}25` }]}>
                <Ionicons name={(cat.categoryIcon || 'tag') as any} size={14} color={cat.categoryColor} />
              </View>
              <View>
                <Text style={styles.categoryName} numberOfLines={1}>
                  {cat.categoryName}
                </Text>
                <Text style={styles.categorySub}>
                  {cat.transactionCount} {cat.transactionCount === 1 ? 'tx' : 'txs'} • {cat.percentageOfTotal}%
                </Text>
              </View>
            </View>

            <View style={styles.categoryRight}>
              <Text style={styles.categoryAmount}>{formatCurrency(cat.totalSpentPaise)}</Text>
              {onSelectCategory && (
                <Ionicons name="chevron-forward" size={14} color={Colors.textDisabled} />
              )}
            </View>
          </TouchableOpacity>
        ))}
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
  cardTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  barWrapper: {
    borderRadius: Radius.full,
    overflow: 'hidden',
    backgroundColor: Colors.inputBg,
    marginBottom: Spacing.md,
  },
  categoryList: {
    gap: Spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  categorySub: {
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoryAmount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
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
});
