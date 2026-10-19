const {
  hashPassword,
  verifyPassword,
  generateTemporaryPassword,
} = require('../../src/lib/password');

describe('password helpers', () => {
  test('hashes with bcrypt and verifies', async () => {
    const hash = await hashPassword('Correct@Horse9');

    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword('Correct@Horse9', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  test('temporary passwords mix character classes and avoid look-alikes', () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generateTemporaryPassword();

      expect(password).toHaveLength(10);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[@#$%&*]/);
      expect(password).not.toMatch(/[0O1lI]/);
    }
  });
});
