const { toLocalDateString, toZonedIso } = require('../src/lib/time');

describe('IST date handling', () => {
  test('a UTC evening instant is already the next calendar day in IST', () => {
    const instant = new Date('2026-01-01T19:00:00.000Z');

    expect(toLocalDateString(instant, 'UTC')).toBe('2026-01-01');
    expect(toLocalDateString(instant)).toBe('2026-01-02');
  });

  test('formats ISO strings with an explicit +05:30 offset', () => {
    const instant = new Date('2026-06-15T03:30:00.000Z');

    expect(toZonedIso(instant)).toBe('2026-06-15T09:00:00+05:30');
    expect(toZonedIso(instant, 'UTC')).toBe('2026-06-15T03:30:00+00:00');
  });
});
