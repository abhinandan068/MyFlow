/**
 * Currency utilities — all amounts stored as integer minor units (paise for INR).
 * ₹1 = 100 paise.  We never use floats for financial math.
 */

export const CURRENCY_SYMBOL = '₹';
export const MINOR_UNIT_FACTOR = 100; // paise per rupee

/**
 * Parse a user-entered string (e.g. "1,234.50") to integer paise.
 * Returns NaN if the string is not a valid number.
 */
export function parseToPaise(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') return NaN;
  const float = parseFloat(cleaned);
  if (isNaN(float)) return NaN;
  // Round to avoid floating-point issues
  return Math.round(float * MINOR_UNIT_FACTOR);
}

/**
 * Format paise as a human-readable rupee string.
 * e.g. 10050 → "₹100.50"
 */
export function formatCurrency(
  paise: number,
  options: {
    showSymbol?: boolean;
    compact?: boolean;
    showSign?: boolean;
    signForPositive?: '+' | '';
  } = {}
): string {
  const {
    showSymbol = true,
    compact = false,
    showSign = false,
    signForPositive = '',
  } = options;

  const abs = Math.abs(paise);
  const rupees = abs / MINOR_UNIT_FACTOR;
  const isNegative = paise < 0;

  let formatted: string;

  if (compact && abs >= 10_000_000) {
    formatted = (rupees / 1_00_000).toFixed(2) + 'L'; // lakh
  } else if (compact && abs >= 1_00_000) {
    formatted = (rupees / 1_00_000).toFixed(2) + 'L';
  } else if (compact && abs >= 1_000) {
    formatted = (rupees / 1_000).toFixed(1) + 'K';
  } else {
    formatted = rupees.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const symbol = showSymbol ? CURRENCY_SYMBOL : '';
  const sign = isNegative ? '-' : showSign ? signForPositive : '';

  return `${sign}${symbol}${formatted}`;
}

/**
 * Format paise as a compact string for dashboard cards.
 * e.g. 150000 → "₹1,500.00"
 */
export function formatCompact(paise: number): string {
  return formatCurrency(paise, { compact: true });
}

/**
 * Add paise values safely.
 */
export function addPaise(...values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

/**
 * Get absolute value of paise.
 */
export function absPaise(paise: number): number {
  return Math.abs(paise);
}
