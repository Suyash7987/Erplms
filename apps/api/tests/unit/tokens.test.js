const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} = require('../../src/lib/tokens');

const profile = {
  key: 'r:p',
  roleId: '11111111-1111-4111-8111-111111111111',
  roleCode: 'parent',
  type: 'student',
  id: '22222222-2222-4222-8222-222222222222',
};

describe('tokens', () => {
  test('access tokens carry user, institute, active role and profile', () => {
    const token = signAccessToken({
      userId: 'user-1',
      instituteId: 'inst-1',
      profile,
      consentPending: true,
    });

    expect(verifyAccessToken(token)).toMatchObject({
      sub: 'user-1',
      iid: 'inst-1',
      rid: profile.roleId,
      role: 'parent',
      pt: 'student',
      pid: profile.id,
      cp: true,
    });
  });

  test('access and refresh tokens cannot be swapped', () => {
    const access = signAccessToken({ userId: 'u', instituteId: 'i', profile });
    const { token: refresh } = signRefreshToken({
      userId: 'u',
      instituteId: 'i',
      familyId: 'f',
      profileKey: 'k',
    });

    expect(() => verifyAccessToken(refresh)).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => verifyRefreshToken(access)).toThrow(
      expect.objectContaining({ code: 'SESSION_EXPIRED' }),
    );
  });

  test('refresh tokens expire after REFRESH_TOKEN_TTL_DAYS and are stored as SHA-256', () => {
    const { token, expiresAt } = signRefreshToken({
      userId: 'u',
      instituteId: 'i',
      familyId: 'f',
      profileKey: 'k',
    });
    const days = (expiresAt.getTime() - Date.now()) / 86_400_000;

    expect(days).toBeGreaterThan(29.9);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token.slice(0, 10));
  });
});
