const { withTenant } = require('../../lib/prisma');

/**
 * Per-request session lookup for a verified access token. Returns null when the user no longer
 * exists; `permissions` is null when the token's role is no longer assigned to the user.
 */
function loadSession(claims) {
  return withTenant(claims.iid, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: claims.sub, instituteId: claims.iid },
      select: {
        status: true,
        mustChangePassword: true,
        passwordChangedAt: true,
        institute: { select: { status: true, enabledModules: true } },
      },
    });
    if (!user) return null;

    const assignment = await tx.userRole.findFirst({
      where: { instituteId: claims.iid, userId: claims.sub, roleId: claims.rid },
      select: {
        role: {
          select: { rolePermissions: { select: { permission: { select: { code: true } } } } },
        },
      },
    });

    return {
      user,
      institute: user.institute,
      permissions: assignment
        ? assignment.role.rolePermissions.map((rp) => rp.permission.code)
        : null,
    };
  });
}

module.exports = { loadSession };
