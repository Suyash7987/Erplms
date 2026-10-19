/** Home screen for each role. Custom staff roles use the admin area. */
const HOME_BY_ROLE = {
  teacher: '/teacher',
  parent: '/parent',
  student: '/student',
};

export function homePathFor(profile) {
  return HOME_BY_ROLE[profile?.roleCode] ?? '/admin';
}

/**
 * Where a signed-in user should go next: onboarding steps first (password, consent), then the
 * profile picker right after login when there is more than one profile, then the role home.
 */
export function nextPathFor(session, { afterLogin = false } = {}) {
  if (session.mustChangePassword) return '/change-password';
  if (session.consentPending) return '/consent';
  if (afterLogin && session.profiles.length > 1) return '/select-profile';
  return homePathFor(session.activeProfile);
}
