/** Human label for a profile: "Parent of Aarav", "Student · Navya", or the staff role name. */
export function profileLabel(t, profile) {
  if (profile.roleCode === 'parent') return t('profile.parentOf', { name: profile.label });
  if (profile.roleCode === 'student') return t('profile.studentNamed', { name: profile.label });
  return profile.roleName;
}
