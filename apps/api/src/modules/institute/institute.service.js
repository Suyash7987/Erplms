const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { recordAudit } = require('../../lib/audit');
const { formatDateOnly } = require('../../lib/dates');
const { TOGGLEABLE_MODULES } = require('../../config/permissions');

const PROFILE_FIELDS = [
  'name',
  'board',
  'boardName',
  'phone',
  'email',
  'addressLine',
  'city',
  'state',
  'pincode',
];

const INSTITUTE_SELECT = {
  id: true,
  name: true,
  slug: true,
  board: true,
  boardName: true,
  phone: true,
  email: true,
  addressLine: true,
  city: true,
  state: true,
  pincode: true,
  timezone: true,
  settings: true,
  enabledModules: true,
};

function withModuleDefaults(enabledModules) {
  return Object.fromEntries(
    TOGGLEABLE_MODULES.map((module) => [module, enabledModules?.[module] === true]),
  );
}

function toView(institute) {
  return { ...institute, enabledModules: withModuleDefaults(institute.enabledModules) };
}

async function loadInstitute(tx, instituteId) {
  const institute = await tx.institute.findFirst({
    where: { id: instituteId },
    select: INSTITUTE_SELECT,
  });
  if (!institute) throw AppError.notFound('Institute not found');
  return institute;
}

function getInstitute(ctx) {
  return withTenant(ctx.instituteId, async (tx) =>
    toView(await loadInstitute(tx, ctx.instituteId)),
  );
}

/** Settings are merged one level deep, so saving `labels` does not wipe `attendance`. */
function mergeSettings(current, patch) {
  const merged = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    merged[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(merged[key] ?? {}), ...value }
        : value;
  }
  return merged;
}

/** Profile fields replace, settings merge one level deep, module flags merge. Audited. */
async function applyInstituteUpdate(tx, ctx, { settings, enabledModules, ...profile }, meta) {
  const before = await loadInstitute(tx, ctx.instituteId);
  const data = {};
  for (const field of PROFILE_FIELDS) {
    if (profile[field] !== undefined) data[field] = profile[field];
  }
  if (settings) data.settings = mergeSettings(before.settings, settings);
  if (enabledModules) {
    data.enabledModules = { ...withModuleDefaults(before.enabledModules), ...enabledModules };
  }
  const changed = Object.keys(data);
  if (!changed.length) return before;

  const after = await tx.institute.update({
    where: { id: ctx.instituteId },
    data,
    select: INSTITUTE_SELECT,
  });
  await recordAudit(tx, {
    instituteId: ctx.instituteId,
    userId: ctx.userId,
    action: 'institute.update',
    entity: 'institute',
    entityId: ctx.instituteId,
    before: Object.fromEntries(changed.map((key) => [key, before[key]])),
    after: Object.fromEntries(changed.map((key) => [key, after[key]])),
    meta,
  });
  return after;
}

function updateInstitute(ctx, body, meta) {
  return withTenant(ctx.instituteId, async (tx) =>
    toView(await applyInstituteUpdate(tx, ctx, body, meta)),
  );
}

async function computeSetupStatus(tx, instituteId) {
  const institute = await loadInstitute(tx, instituteId);
  const currentYear = await tx.academicYear.findFirst({
    where: { instituteId, status: 'current' },
    select: { id: true, name: true, startDate: true, endDate: true },
  });
  const levels = await tx.level.count({ where: { instituteId, isActive: true } });
  const sections = currentYear
    ? await tx.section.count({ where: { instituteId, academicYearId: currentYear.id } })
    : 0;
  const subjects = await tx.subject.count({ where: { instituteId, isActive: true } });

  const steps = {
    profile: Boolean(institute.settings?.setup?.profileConfirmedAt),
    academicYear: Boolean(currentYear),
    levels: levels > 0,
    sections: sections > 0,
    subjects: subjects > 0,
  };
  return {
    completed: Boolean(institute.settings?.setup?.completedAt),
    completedAt: institute.settings?.setup?.completedAt ?? null,
    steps,
    counts: { levels, sections, subjects },
    currentAcademicYear: currentYear
      ? {
          id: currentYear.id,
          name: currentYear.name,
          startDate: formatDateOnly(currentYear.startDate),
          endDate: formatDateOnly(currentYear.endDate),
        }
      : null,
    institute: toView(institute),
  };
}

function getSetupStatus(ctx) {
  return withTenant(ctx.instituteId, (tx) => computeSetupStatus(tx, ctx.instituteId));
}

async function markSetupStep(tx, ctx, patch) {
  const institute = await loadInstitute(tx, ctx.instituteId);
  await tx.institute.update({
    where: { id: ctx.instituteId },
    data: { settings: mergeSettings(institute.settings, { setup: patch }) },
  });
}

/** The wizard's first step: saves the profile and records that the admin reviewed it. */
function confirmProfile(ctx, body, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    await applyInstituteUpdate(tx, ctx, body, meta);
    await markSetupStep(tx, ctx, { profileConfirmedAt: new Date().toISOString() });
    return computeSetupStatus(tx, ctx.instituteId);
  });
}

function completeSetup(ctx, meta) {
  return withTenant(ctx.instituteId, async (tx) => {
    const status = await computeSetupStatus(tx, ctx.instituteId);
    const missing = Object.entries(status.steps)
      .filter(([, done]) => !done)
      .map(([step]) => step);
    if (missing.length) {
      throw AppError.conflict('Finish every setup step first', { missing });
    }
    if (!status.completed) {
      await markSetupStep(tx, ctx, { completedAt: new Date().toISOString() });
      await recordAudit(tx, {
        instituteId: ctx.instituteId,
        userId: ctx.userId,
        action: 'institute.setup_complete',
        entity: 'institute',
        entityId: ctx.instituteId,
        after: status.counts,
        meta,
      });
    }
    return computeSetupStatus(tx, ctx.instituteId);
  });
}

module.exports = {
  getInstitute,
  updateInstitute,
  getSetupStatus,
  confirmProfile,
  completeSetup,
};
