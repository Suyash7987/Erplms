const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { withTenant } = require('../../src/lib/prisma');
const { hashPassword } = require('../../src/lib/password');
const { syncPermissionCatalog, syncSystemRoles } = require('../../src/modules/roles/roles.service');

const PASSWORD = 'Valid@Pass1';
const date = (isoDate) => new Date(`${isoDate}T00:00:00.000Z`);

/**
 * An institute with system roles and one user per scenario. Every user's password is PASSWORD.
 *   admin, frontOffice, teacher, lockme, pwdUser   - staff
 *   teacherParent  - teacher who is also the parent of child3
 *   parent         - parent of siblings child1 and child2
 *   student        - child2's own login
 *   newcomer       - teacher who must change the temporary password
 *   disabled       - disabled teacher
 */
async function createAuthTenant(label) {
  const permissionIds = await syncPermissionCatalog();
  const passwordHash = await hashPassword(PASSWORD);
  const instituteId = randomUUID();
  const slug = `${label.toLowerCase()}-${instituteId.slice(0, 8)}`;

  return withTenant(instituteId, async (tx) => {
    await tx.institute.create({
      data: { id: instituteId, name: `${label} School`, slug, board: 'ICSE' },
    });
    const roleIds = await syncSystemRoles(tx, instituteId, permissionIds);

    const year = await tx.academicYear.create({
      data: {
        instituteId,
        name: '2026-27',
        startDate: date('2026-04-01'),
        endDate: date('2027-03-31'),
        status: 'current',
      },
    });
    const level = await tx.level.create({
      data: { instituteId, name: 'Class 3', band: 'primary', sortOrder: 3 },
    });
    const section = await tx.section.create({
      data: { instituteId, academicYearId: year.id, levelId: level.id, name: 'A' },
    });

    const users = {};
    let nextPhone = 9100000001;
    async function addUser(key, roles, { staff = false, ...extra } = {}) {
      const phone = String(nextPhone++);
      const user = await tx.user.create({
        data: {
          instituteId,
          phone,
          name: `${label} ${key}`,
          passwordHash,
          mustChangePassword: false,
          ...extra,
        },
      });
      await tx.userRole.createMany({
        data: roles.map((code) => ({ instituteId, userId: user.id, roleId: roleIds[code] })),
      });
      if (staff) {
        await tx.staff.create({
          data: {
            instituteId,
            userId: user.id,
            employeeCode: `E-${key}`,
            name: user.name,
            phone,
          },
        });
      }
      users[key] = { id: user.id, phone };
      return user.id;
    }

    await addUser('admin', ['admin'], { staff: true });
    await addUser('frontOffice', ['front_office'], { staff: true });
    await addUser('teacher', ['teacher'], { staff: true });
    await addUser('lockme', ['teacher'], { staff: true });
    await addUser('pwdUser', ['teacher'], { staff: true });
    await addUser('teacherParent', ['teacher', 'parent'], { staff: true });
    await addUser('parent', ['parent']);
    await addUser('student', ['student']);
    await addUser('newcomer', ['teacher'], { staff: true, mustChangePassword: true });
    await addUser('disabled', ['teacher'], { staff: true, status: 'disabled' });

    const students = {};
    const children = [
      ['child1', 'Asha', null],
      ['child2', 'Bala', users.student.id],
      ['child3', 'Chetan', null],
    ];
    for (const [index, [key, firstName, userId]] of children.entries()) {
      const student = await tx.student.create({
        data: {
          instituteId,
          academicYearId: year.id,
          admissionNo: `A${index + 1}`,
          firstName,
          lastName: label,
          userId,
        },
      });
      await tx.studentEnrollment.create({
        data: {
          instituteId,
          studentId: student.id,
          academicYearId: year.id,
          sectionId: section.id,
          rollNo: index + 1,
        },
      });
      students[key] = student.id;
    }

    async function addGuardian(userKey, childKeys) {
      const guardian = await tx.guardian.create({
        data: {
          instituteId,
          userId: users[userKey].id,
          name: `${label} ${userKey}`,
          phone: users[userKey].phone,
        },
      });
      for (const childKey of childKeys) {
        await tx.studentGuardian.create({
          data: {
            instituteId,
            studentId: students[childKey],
            guardianId: guardian.id,
            relation: 'mother',
            isPrimary: true,
          },
        });
      }
    }
    await addGuardian('parent', ['child1', 'child2']);
    await addGuardian('teacherParent', ['child3']);

    return { instituteId, slug, roleIds, users, students };
  });
}

/** Signs in through the API and returns a supertest agent that keeps the auth cookies. */
async function signIn(app, tenant, userKey, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({
    instituteCode: tenant.slug,
    phone: tenant.users[userKey].phone,
    password,
  });
  return { agent, res };
}

/** Value of a Set-Cookie header, e.g. cookieValue(res, 'erp_rt'). */
function cookieValue(res, name) {
  const header = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return header ? header.split(';')[0].slice(name.length + 1) : undefined;
}

module.exports = { createAuthTenant, signIn, cookieValue, PASSWORD };
