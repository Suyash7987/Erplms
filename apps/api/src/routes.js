const { Router } = require('express');
const { apiRateLimiter } = require('./middleware/rateLimit');
const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const rolesRoutes = require('./modules/roles/roles.routes');
const instituteRoutes = require('./modules/institute/institute.routes');
const academicYearsRoutes = require('./modules/academic-years/academic-years.routes');
const levelsRoutes = require('./modules/levels/levels.routes');
const sectionsRoutes = require('./modules/sections/sections.routes');
const subjectsRoutes = require('./modules/subjects/subjects.routes');
const staffRoutes = require('./modules/staff/staff.routes');
const studentsRoutes = require('./modules/students/students.routes');
const guardiansRoutes = require('./modules/guardians/guardians.routes');
const importsRoutes = require('./modules/imports/imports.routes');
const attendanceRoutes = require('./modules/attendance/attendance.routes');

const router = Router();

// Health checks are polled by load balancers and must not consume the per-IP budget.
router.use('/health', healthRoutes);

router.use(apiRateLimiter);

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/roles', rolesRoutes);
router.use('/institute', instituteRoutes);
router.use('/academic-years', academicYearsRoutes);
router.use('/levels', levelsRoutes);
router.use('/sections', sectionsRoutes);
router.use('/subjects', subjectsRoutes);
router.use('/staff', staffRoutes);
router.use('/students', studentsRoutes);
router.use('/guardians', guardiansRoutes);
router.use('/imports', importsRoutes);
router.use('/attendance', attendanceRoutes);

module.exports = router;
