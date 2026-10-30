import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  today,
  currentMonth,
  formatDate,
  formatHeaderDate,
  formatMonth,
  formatMonthShort,
  monthOf,
  lastNMonths,
  compareDates,
  monthRange,
  relativeDateLabel,
  getDateRangeForPreset,
  getMonthsBetween,
  shiftMonth,
  parseTimeString,
  toISODateString,
} from '../src/utils/date';

describe('Date Utilities — MyFlow Verification', () => {
  it('formats dates as DD Mon YYYY accurately', () => {
    assert.strictEqual(formatDate('2026-10-29'), '29 Oct 2026');
    assert.strictEqual(formatDate('2026-01-05'), '05 Jan 2026');
    assert.strictEqual(formatDate('2025-12-03'), '03 Dec 2025');
    // ISO datetime format
    assert.strictEqual(formatDate('2026-10-29T14:30:00.000Z'), '29 Oct 2026');
  });

  it('handles invalid dates gracefully', () => {
    assert.strictEqual(formatDate(''), '');
    assert.strictEqual(formatDate('invalid-date'), 'invalid-date');
    // Feb 30th does not exist
    assert.strictEqual(formatDate('2026-02-30'), '2026-02-30');
  });

  it('formats header dates with weekday and DD Mon YYYY format', () => {
    // 2026-10-29 is a Thursday
    const formatted = formatHeaderDate('2026-10-29');
    assert.strictEqual(formatted, 'Thursday, 29 Oct 2026');
  });

  it('today and currentMonth use local calendar dates in ISO format', () => {
    const t = today();
    assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
    const cm = currentMonth();
    assert.match(cm, /^\d{4}-\d{2}$/);
    assert.strictEqual(t.slice(0, 7), cm);
  });

  it('relativeDateLabel marks today and yesterday correctly', () => {
    const t = today();
    assert.strictEqual(relativeDateLabel(t), 'Today');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = toISODateString(yesterday);
    assert.strictEqual(relativeDateLabel(yStr), 'Yesterday');

    assert.strictEqual(relativeDateLabel('2025-01-01'), '01 Jan 2025');
  });

  it('preserves monthOf, formatMonth, formatMonthShort', () => {
    assert.strictEqual(monthOf('2026-10-29'), '2026-10');
    assert.strictEqual(formatMonth('2026-10'), 'October 2026');
    assert.strictEqual(formatMonthShort('2026-10'), "Oct '26");
  });

  it('preserves monthRange and shiftMonth', () => {
    const range = monthRange('2026-02');
    assert.strictEqual(range.start, '2026-02-01');
    assert.strictEqual(range.end, '2026-02-28');

    assert.strictEqual(shiftMonth('2026-10', 1), '2026-11');
    assert.strictEqual(shiftMonth('2026-10', -1), '2026-09');
    assert.strictEqual(shiftMonth('2026-12', 1), '2027-01');
  });

  it('preserves parseTimeString', () => {
    assert.deepStrictEqual(parseTimeString('21:30'), { hour: 21, minute: 30 });
    assert.deepStrictEqual(parseTimeString(''), { hour: 21, minute: 0 });
    assert.deepStrictEqual(parseTimeString('invalid'), { hour: 21, minute: 0 });
  });
});
