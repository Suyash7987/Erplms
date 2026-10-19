const { withTenant } = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { toSkipTake, pageResult } = require('../../lib/pagination');

const LEVEL_SELECT = {
  id: true,
  name: true,
  code: true,
  band: true,
  sortOrder: true,
  isActive: true,
  _count: { select: { sections: true } },
};

const toView = ({ _count, ...level }) => ({ ...level, sectionCount: _count.sections });

/** Indian school grade bands: 1-5 primary, 6-8 middle, 9-10 secondary, 11-12 senior secondary. */
function bandFor(classNo) {
  if (classNo >= 1 && classNo <= 5) return 'primary';
  if (classNo >= 6 && classNo <= 8) return 'middle';
  if (classNo >= 9 && classNo <= 10) return 'secondary';
  if (classNo >= 11 && classNo <= 12) return 'senior';
  return null;
}

async function findLevelOrThrow(tx, instituteId, id) {
  const level = await tx.level.findFirst({ where: { id, instituteId }, select: LEVEL_SELECT });
  if (!level) throw AppError.notFound('Class not found');
  return level;
}

function listLevels(ctx, { page, limit, includeInactive }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const where = { instituteId: ctx.instituteId, ...(includeInactive ? {} : { isActive: true }) };
    const levels = await tx.level.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: LEVEL_SELECT,
      ...toSkipTake({ page, limit }),
    });
    const total = await tx.level.count({ where });
    return pageResult(levels.map(toView), total, { page, limit });
  });
}

function createLevel(ctx, { name, code, band, sortOrder }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const order =
      sortOrder ??
      ((
        await tx.level.aggregate({
          where: { instituteId: ctx.instituteId },
          _max: { sortOrder: true },
        })
      )._max.sortOrder ?? 0) + 1;
    const level = await tx.level.create({
      data: { instituteId: ctx.instituteId, name, code, band, sortOrder: order },
      select: { id: true },
    });
    return toView(await findLevelOrThrow(tx, ctx.instituteId, level.id));
  });
}

/**
 * Quick setup: creates "<prefix> N" for every N in the range (e.g. Class 1-12) with the matching
 * grade band. Existing names are skipped, so it is safe to run again.
 */
function createLevelRange(ctx, { from, to, prefix }) {
  return withTenant(ctx.instituteId, async (tx) => {
    const institute = await tx.institute.findFirst({
      where: { id: ctx.instituteId },
      select: { settings: true },
    });
    const label = prefix ?? institute?.settings?.labels?.level ?? 'Class';
    const data = [];
    for (let n = from; n <= to; n += 1) {
      data.push({
        instituteId: ctx.instituteId,
        name: `${label} ${n}`,
        code: String(n),
        band: bandFor(n),
        sortOrder: n,
      });
    }
    const { count } = await tx.level.createMany({ data, skipDuplicates: true });
    const levels = await tx.level.findMany({
      where: { instituteId: ctx.instituteId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: LEVEL_SELECT,
    });
    return { created: count, skipped: data.length - count, data: levels.map(toView) };
  });
}

function updateLevel(ctx, id, changes) {
  return withTenant(ctx.instituteId, async (tx) => {
    await findLevelOrThrow(tx, ctx.instituteId, id);
    await tx.level.update({ where: { id }, data: changes });
    return toView(await findLevelOrThrow(tx, ctx.instituteId, id));
  });
}

function deleteLevel(ctx, id) {
  return withTenant(ctx.instituteId, async (tx) => {
    const level = await findLevelOrThrow(tx, ctx.instituteId, id);
    if (level._count.sections) {
      throw AppError.conflict('This class has sections. Mark it inactive instead of deleting it.');
    }
    await tx.level.delete({ where: { id } });
  });
}

module.exports = { listLevels, createLevel, createLevelRange, updateLevel, deleteLevel, bandFor };
