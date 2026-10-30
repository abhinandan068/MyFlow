/**
 * Date utilities for MyFlow.
 * All dates stored as ISO 8601 strings (YYYY-MM-DD or full datetime).
 */

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const MONTH_FULL_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Format a local Date object to YYYY-MM-DD string without UTC shift.
 */
export function toISODateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD in local time.
 */
export function today(): string {
  return toISODateString(new Date());
}

/**
 * Get current month as YYYY-MM in local time.
 */
export function currentMonth(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Format a YYYY-MM-DD string as DD Mon YYYY.
 * Examples:
 * - "2026-10-29" -> "29 Oct 2026"
 * - "2026-01-05" -> "05 Jan 2026"
 * - "2025-12-03" -> "03 Dec 2025"
 * Avoids any timezone shift by directly parsing year, month, and day components.
 */
export function formatDate(iso: string): string {
  if (!iso || typeof iso !== 'string') {
    return '';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return iso;
  }

  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (month < 1 || month > 12) {
    return iso;
  }

  // Reject invalid calendar dates rather than displaying misleading values
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > lastDayOfMonth) {
    return iso;
  }

  const monthName = MONTH_NAMES[month - 1];
  return `${dayStr} ${monthName} ${yearStr}`;
}

/**
 * Format a date for headers, preserving weekday and DD Mon YYYY format.
 * Example: "Thursday, 29 Oct 2026".
 */
export function formatHeaderDate(dateOrIso?: Date | string): string {
  if (typeof dateOrIso === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOrIso);
    if (match) {
      const [, yStr, mStr, dStr] = match;
      const y = Number(yStr);
      const m = Number(mStr);
      const d = Number(dStr);
      const dateObj = new Date(y, m - 1, d);
      const weekday = WEEKDAY_NAMES[dateObj.getDay()];
      const monthName = MONTH_NAMES[m - 1];
      return `${weekday}, ${dStr} ${monthName} ${yStr}`;
    }
  }

  const d = dateOrIso instanceof Date ? dateOrIso : new Date();
  const weekday = WEEKDAY_NAMES[d.getDay()];
  const yStr = String(d.getFullYear());
  const m = d.getMonth() + 1;
  const dStr = String(d.getDate()).padStart(2, '0');
  const monthName = MONTH_NAMES[m - 1];
  return `${weekday}, ${dStr} ${monthName} ${yStr}`;
}

/**
 * Format a YYYY-MM string to a human-readable month.
 * Example: "2024-01" -> "January 2024".
 */
export function formatMonth(ym: string): string {
  if (!ym || typeof ym !== 'string') return '';
  const [year, month] = ym.split('-');
  const m = Number(month);
  if (m >= 1 && m <= 12 && year) {
    return `${MONTH_FULL_NAMES[m - 1]} ${year}`;
  }
  return ym;
}

/**
 * Format a YYYY-MM string to a short month.
 * Example: "2024-01" -> "Jan '24".
 */
export function formatMonthShort(ym: string): string {
  if (!ym || typeof ym !== 'string') return '';
  const [year, month] = ym.split('-');
  const m = Number(month);
  if (m >= 1 && m <= 12 && year) {
    const shortYear = year.slice(-2);
    return `${MONTH_NAMES[m - 1]} '${shortYear}`;
  }
  return ym;
}

/**
 * Get month key from a date string.
 * Example: "2024-01-15" -> "2024-01".
 */
export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Get an array of the last N months as YYYY-MM strings, newest first.
 */
export function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const d = new Date();

  for (let i = 0; i < n; i++) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');

    months.push(`${y}-${m}`);
    d.setMonth(d.getMonth() - 1);
  }

  return months;
}

/**
 * Compare two YYYY-MM-DD dates.
 */
export function compareDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Get start and end of a YYYY-MM month as ISO date strings.
 */
export function monthRange(ym: string): { start: string; end: string } {
  const [year, month] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${ym}-${String(lastDay).padStart(2, '0')}`;

  return { start, end };
}

/**
 * Return a relative date label.
 * Today -> "Today"
 * Yesterday -> "Yesterday"
 * Otherwise -> formatted date, e.g. "29 Oct 2026".
 */
export function relativeDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const dPrefix = dateStr.slice(0, 10);
  const t = today();

  if (dPrefix === t) {
    return 'Today';
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = toISODateString(yesterday);

  if (dPrefix === yStr) {
    return 'Yesterday';
  }

  return formatDate(dateStr);
}

/**
 * Get date range for standard analytical presets.
 */
export function getDateRangeForPreset(
  preset: '30d' | 'this_month' | 'last_month' | '6m' | '12m' | 'custom',
  customStart?: string,
  customEnd?: string
): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const t = today();

  switch (preset) {
    case '30d': {
      const past = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      return {
        startDate: toISODateString(past),
        endDate: t,
        label: 'Last 30 Days',
      };
    }

    case 'this_month': {
      const ym = currentMonth();
      return {
        startDate: `${ym}-01`,
        endDate: monthRange(ym).end,
        label: 'Current Month',
      };
    }

    case 'last_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevYm = `${prev.getFullYear()}-${String(
        prev.getMonth() + 1
      ).padStart(2, '0')}`;
      const range = monthRange(prevYm);

      return {
        startDate: range.start,
        endDate: range.end,
        label: 'Previous Month',
      };
    }

    case '6m': {
      const startD = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startYm = `${startD.getFullYear()}-${String(
        startD.getMonth() + 1
      ).padStart(2, '0')}`;

      return {
        startDate: `${startYm}-01`,
        endDate: monthRange(currentMonth()).end,
        label: 'Last 6 Months',
      };
    }

    case '12m': {
      const startD = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const startYm = `${startD.getFullYear()}-${String(
        startD.getMonth() + 1
      ).padStart(2, '0')}`;

      return {
        startDate: `${startYm}-01`,
        endDate: monthRange(currentMonth()).end,
        label: 'Last 12 Months',
      };
    }

    case 'custom':
    default: {
      const start = customStart || t;
      const end = customEnd || t;

      return {
        startDate: start <= end ? start : end,
        endDate: start <= end ? end : start,
        label: 'Custom Range',
      };
    }
  }
}

/**
 * Return YYYY-MM strings in chronological order between two dates,
 * inclusive of the start and end months.
 */
export function getMonthsBetween(
  startDate: string,
  endDate: string
): string[] {
  const startYm = startDate.slice(0, 7);
  const endYm = endDate.slice(0, 7);

  if (startYm > endYm) {
    return [startYm];
  }

  const months: string[] = [];
  const [startYear, startMonth] = startYm.split('-').map(Number);
  const [endYear, endMonth] = endYm.split('-').map(Number);

  let curYear = startYear;
  let curMonth = startMonth;

  while (
    curYear < endYear ||
    (curYear === endYear && curMonth <= endMonth)
  ) {
    months.push(`${curYear}-${String(curMonth).padStart(2, '0')}`);

    curMonth++;

    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
  }

  return months;
}

/**
 * Shift a YYYY-MM string by delta months.
 * +1 for next month, -1 for previous month.
 */
export function shiftMonth(ym: string, delta: number): string {
  const [year, month] = ym.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
}

/**
 * Parse HH:mm into hour and minute integers.
 */
export function parseTimeString(
  timeStr: string
): { hour: number; minute: number } {
  const parts = (timeStr || '').split(':').map((p) => parseInt(p, 10));

  const hour =
    isNaN(parts[0]) || parts[0] < 0 || parts[0] > 23 ? 21 : parts[0];

  const minute =
    isNaN(parts[1]) || parts[1] < 0 || parts[1] > 59 ? 0 : parts[1];

  return { hour, minute };
}
