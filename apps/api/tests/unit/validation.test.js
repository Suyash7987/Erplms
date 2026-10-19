const {
  phoneSchema,
  strongPasswordSchema,
  instituteCodeSchema,
} = require('../../src/lib/validation');

describe('phoneSchema', () => {
  test.each([
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['98765-43210', '9876543210'],
  ])('normalises %s', (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  test.each(['12345', '5876543210', '98765432101', 'abc'])('rejects %s', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});

describe('strongPasswordSchema', () => {
  test('accepts a password with upper, lower, digit and symbol', () => {
    expect(strongPasswordSchema.safeParse('School@2026').success).toBe(true);
  });

  test('explains every missing rule', () => {
    const result = strongPasswordSchema.safeParse('short');
    const messages = result.error.issues.map((issue) => issue.message);

    expect(messages).toEqual(
      expect.arrayContaining([
        'Use at least 8 characters',
        'Add an uppercase letter',
        'Add a number',
        'Add a symbol such as @ # $ %',
      ]),
    );
  });
});

describe('instituteCodeSchema', () => {
  test('is case-insensitive and trimmed', () => {
    expect(instituteCodeSchema.parse('  Demo-School ')).toBe('demo-school');
  });
});
