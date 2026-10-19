-- CreateEnum
CREATE TYPE "board" AS ENUM ('CBSE', 'ICSE', 'STATE');

-- CreateEnum
CREATE TYPE "institute_status" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "academic_year_status" AS ENUM ('upcoming', 'current', 'closed');

-- CreateEnum
CREATE TYPE "level_band" AS ENUM ('primary', 'middle', 'secondary', 'senior');

-- CreateEnum
CREATE TYPE "gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "student_status" AS ENUM ('active', 'inactive', 'transferred', 'passed_out', 'left');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('active', 'promoted', 'detained', 'transferred', 'left', 'completed');

-- CreateEnum
CREATE TYPE "guardian_relation" AS ENUM ('father', 'mother', 'guardian', 'grandparent', 'sibling', 'other');

-- CreateEnum
CREATE TYPE "staff_type" AS ENUM ('teaching', 'non_teaching');

-- CreateEnum
CREATE TYPE "staff_status" AS ENUM ('active', 'inactive', 'left');

-- CreateEnum
CREATE TYPE "attendance_session_type" AS ENUM ('full_day', 'morning', 'afternoon');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('present', 'absent', 'late', 'half_day', 'on_leave');

-- CreateEnum
CREATE TYPE "leave_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "late_fine_type" AS ENUM ('none', 'fixed', 'per_day');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('unpaid', 'partially_paid', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "invoice_item_kind" AS ENUM ('fee', 'late_fine');

-- CreateEnum
CREATE TYPE "concession_type" AS ENUM ('sibling', 'staff_ward', 'merit', 'need_based', 'other');

-- CreateEnum
CREATE TYPE "payment_mode" AS ENUM ('cash', 'cheque', 'upi_manual', 'bank_transfer');

-- CreateEnum
CREATE TYPE "notice_status" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "institutes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "board" "board" NOT NULL,
    "board_name" VARCHAR(120),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "enabled_modules" JSONB NOT NULL DEFAULT '{"attendance":true,"timetable":true,"notices":true,"fees":true,"leaves":true}',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    "phone" VARCHAR(15),
    "email" VARCHAR(254),
    "address_line" VARCHAR(300),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "pincode" VARCHAR(10),
    "status" "institute_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "institutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(254),
    "password_hash" VARCHAR(100) NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ(3),
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "created_by_ip" VARCHAR(45),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(300),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "module" VARCHAR(40) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "institute_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("institute_id","role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity" VARCHAR(60) NOT NULL,
    "entity_id" VARCHAR(64),
    "before" JSONB,
    "after" JSONB,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(300),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "purpose" VARCHAR(60) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    "granted_by_user_id" UUID,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "academic_year_status" NOT NULL DEFAULT 'upcoming',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "code" VARCHAR(20),
    "band" "level_band",
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "capacity" INTEGER,
    "room" VARCHAR(30),
    "class_teacher_staff_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_subjects" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_staff_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "section_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "admission_no" VARCHAR(30) NOT NULL,
    "user_id" UUID,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100),
    "date_of_birth" DATE,
    "gender" "gender",
    "blood_group" VARCHAR(5),
    "admission_date" DATE,
    "address" VARCHAR(300),
    "status" "student_status" NOT NULL DEFAULT 'active',
    "status_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "roll_no" INTEGER,
    "status" "enrollment_status" NOT NULL DEFAULT 'active',
    "enrolled_on" DATE,
    "left_on" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "email" VARCHAR(254),
    "occupation" VARCHAR(100),
    "address" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relation" "guardian_relation" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_fee_payer" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "user_id" UUID,
    "employee_code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(15) NOT NULL,
    "email" VARCHAR(254),
    "designation" VARCHAR(100),
    "department" VARCHAR(100),
    "staff_type" "staff_type" NOT NULL DEFAULT 'teaching',
    "joining_date" DATE,
    "status" "staff_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "session" "attendance_session_type" NOT NULL DEFAULT 'full_day',
    "marked_by_user_id" UUID,
    "marked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "attendance_session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "session" "attendance_session_type" NOT NULL,
    "status" "attendance_status" NOT NULL,
    "remark" VARCHAR(200),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaves" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" "leave_status" NOT NULL DEFAULT 'pending',
    "applied_by_user_id" UUID NOT NULL,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "period_no" INTEGER NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "start_time" CHAR(5) NOT NULL,
    "end_time" CHAR(5) NOT NULL,
    "is_break" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_staff_id" UUID,
    "period_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_time" CHAR(5) NOT NULL,
    "end_time" CHAR(5) NOT NULL,
    "room" VARCHAR(30),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" VARCHAR(300),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_items" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "fee_structure_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "installment_no" INTEGER NOT NULL DEFAULT 1,
    "amount_paise" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "late_fine_type" "late_fine_type" NOT NULL DEFAULT 'none',
    "late_fine_amount_paise" BIGINT NOT NULL DEFAULT 0,
    "late_fine_grace_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fee_structure_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_invoices" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "fee_structure_id" UUID,
    "installment_no" INTEGER NOT NULL DEFAULT 1,
    "due_date" DATE NOT NULL,
    "gross_paise" BIGINT NOT NULL,
    "concession_paise" BIGINT NOT NULL DEFAULT 0,
    "fine_paise" BIGINT NOT NULL DEFAULT 0,
    "net_paise" BIGINT NOT NULL,
    "paid_paise" BIGINT NOT NULL DEFAULT 0,
    "status" "invoice_status" NOT NULL DEFAULT 'unpaid',
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_reason" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_fee_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "fee_head_id" UUID,
    "kind" "invoice_item_kind" NOT NULL DEFAULT 'fee',
    "description" VARCHAR(200) NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concessions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_id" UUID,
    "fee_head_id" UUID,
    "type" "concession_type" NOT NULL,
    "percent_basis_points" INTEGER,
    "amount_paise" BIGINT,
    "reason" VARCHAR(300),
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "concessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "receipt_seq" INTEGER NOT NULL,
    "receipt_no" VARCHAR(40) NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "mode" "payment_mode" NOT NULL,
    "reference_no" VARCHAR(60),
    "instrument_date" DATE,
    "bank_name" VARCHAR(100),
    "paid_on" DATE NOT NULL,
    "collected_by_user_id" UUID NOT NULL,
    "remarks" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "reversed_by_user_id" UUID NOT NULL,
    "reversed_on" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_sequences" (
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "prefix" VARCHAR(20) NOT NULL DEFAULT '',
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "receipt_sequences_pkey" PRIMARY KEY ("institute_id","academic_year_id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "status" "notice_status" NOT NULL DEFAULT 'draft',
    "audience_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "audience_level_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "audience_section_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "published_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_reads" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "notice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notice_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(60),
    "entity_id" VARCHAR(64),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institutes_slug_key" ON "institutes"("slug");

-- CreateIndex
CREATE INDEX "users_institute_id_status_idx" ON "users"("institute_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_institute_id_phone_key" ON "users"("institute_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_institute_id_id_key" ON "users"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_institute_id_user_id_idx" ON "refresh_tokens"("institute_id", "user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_institute_id_family_id_idx" ON "refresh_tokens"("institute_id", "family_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_institute_id_code_key" ON "roles"("institute_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "roles_institute_id_id_key" ON "roles"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_institute_id_role_id_idx" ON "user_roles"("institute_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_institute_id_user_id_role_id_key" ON "user_roles"("institute_id", "user_id", "role_id");

-- CreateIndex
CREATE INDEX "audit_logs_institute_id_created_at_idx" ON "audit_logs"("institute_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_institute_id_entity_entity_id_idx" ON "audit_logs"("institute_id", "entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_institute_id_user_id_idx" ON "audit_logs"("institute_id", "user_id");

-- CreateIndex
CREATE INDEX "consents_institute_id_student_id_idx" ON "consents"("institute_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "consents_institute_id_guardian_id_student_id_purpose_versio_key" ON "consents"("institute_id", "guardian_id", "student_id", "purpose", "version");

-- CreateIndex
CREATE INDEX "academic_years_institute_id_status_idx" ON "academic_years"("institute_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_institute_id_name_key" ON "academic_years"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_institute_id_id_key" ON "academic_years"("institute_id", "id");

-- CreateIndex
CREATE INDEX "levels_institute_id_sort_order_idx" ON "levels"("institute_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "levels_institute_id_name_key" ON "levels"("institute_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "levels_institute_id_id_key" ON "levels"("institute_id", "id");

-- CreateIndex
CREATE INDEX "sections_institute_id_level_id_idx" ON "sections"("institute_id", "level_id");

-- CreateIndex
CREATE INDEX "sections_institute_id_class_teacher_staff_id_idx" ON "sections"("institute_id", "class_teacher_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_institute_id_academic_year_id_level_id_name_key" ON "sections"("institute_id", "academic_year_id", "level_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sections_institute_id_id_key" ON "sections"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_institute_id_code_key" ON "subjects"("institute_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_institute_id_id_key" ON "subjects"("institute_id", "id");

-- CreateIndex
CREATE INDEX "section_subjects_institute_id_teacher_staff_id_idx" ON "section_subjects"("institute_id", "teacher_staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "section_subjects_institute_id_section_id_subject_id_key" ON "section_subjects"("institute_id", "section_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE INDEX "students_institute_id_status_idx" ON "students"("institute_id", "status");

-- CreateIndex
CREATE INDEX "students_institute_id_first_name_idx" ON "students"("institute_id", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "students_institute_id_academic_year_id_admission_no_key" ON "students"("institute_id", "academic_year_id", "admission_no");

-- CreateIndex
CREATE UNIQUE INDEX "students_institute_id_id_key" ON "students"("institute_id", "id");

-- CreateIndex
CREATE INDEX "student_enrollments_institute_id_section_id_status_idx" ON "student_enrollments"("institute_id", "section_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_institute_id_academic_year_id_student_i_key" ON "student_enrollments"("institute_id", "academic_year_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_enrollments_institute_id_section_id_roll_no_key" ON "student_enrollments"("institute_id", "section_id", "roll_no");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_user_id_key" ON "guardians"("user_id");

-- CreateIndex
CREATE INDEX "guardians_institute_id_phone_idx" ON "guardians"("institute_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_institute_id_id_key" ON "guardians"("institute_id", "id");

-- CreateIndex
CREATE INDEX "student_guardians_institute_id_guardian_id_idx" ON "student_guardians"("institute_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_institute_id_student_id_guardian_id_key" ON "student_guardians"("institute_id", "student_id", "guardian_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE INDEX "staff_institute_id_status_idx" ON "staff"("institute_id", "status");

-- CreateIndex
CREATE INDEX "staff_institute_id_phone_idx" ON "staff"("institute_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "staff_institute_id_employee_code_key" ON "staff"("institute_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "staff_institute_id_id_key" ON "staff"("institute_id", "id");

-- CreateIndex
CREATE INDEX "attendance_sessions_institute_id_academic_year_id_date_idx" ON "attendance_sessions"("institute_id", "academic_year_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_institute_id_section_id_date_session_key" ON "attendance_sessions"("institute_id", "section_id", "date", "session");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_institute_id_id_key" ON "attendance_sessions"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_institute_id_id_date_session_key" ON "attendance_sessions"("institute_id", "id", "date", "session");

-- CreateIndex
CREATE INDEX "attendance_records_institute_id_date_status_idx" ON "attendance_records"("institute_id", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_institute_id_student_id_date_session_key" ON "attendance_records"("institute_id", "student_id", "date", "session");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_institute_id_attendance_session_id_stude_key" ON "attendance_records"("institute_id", "attendance_session_id", "student_id");

-- CreateIndex
CREATE INDEX "leaves_institute_id_student_id_idx" ON "leaves"("institute_id", "student_id");

-- CreateIndex
CREATE INDEX "leaves_institute_id_staff_id_idx" ON "leaves"("institute_id", "staff_id");

-- CreateIndex
CREATE INDEX "leaves_institute_id_status_from_date_idx" ON "leaves"("institute_id", "status", "from_date");

-- CreateIndex
CREATE UNIQUE INDEX "periods_institute_id_academic_year_id_period_no_key" ON "periods"("institute_id", "academic_year_id", "period_no");

-- CreateIndex
CREATE UNIQUE INDEX "periods_institute_id_id_key" ON "periods"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_institute_id_academic_year_id_section_id_da_key" ON "timetable_slots"("institute_id", "academic_year_id", "section_id", "day_of_week", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_institute_id_academic_year_id_teacher_staff_key" ON "timetable_slots"("institute_id", "academic_year_id", "teacher_staff_id", "day_of_week", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_institute_id_academic_year_id_room_day_of_w_key" ON "timetable_slots"("institute_id", "academic_year_id", "room", "day_of_week", "period_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_institute_id_code_key" ON "fee_heads"("institute_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_institute_id_id_key" ON "fee_heads"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_institute_id_academic_year_id_level_id_name_key" ON "fee_structures"("institute_id", "academic_year_id", "level_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_institute_id_id_key" ON "fee_structures"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_items_institute_id_fee_structure_id_fee_head__key" ON "fee_structure_items"("institute_id", "fee_structure_id", "fee_head_id", "installment_no");

-- CreateIndex
CREATE INDEX "student_fee_invoices_institute_id_academic_year_id_status_idx" ON "student_fee_invoices"("institute_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "student_fee_invoices_institute_id_due_date_idx" ON "student_fee_invoices"("institute_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_invoices_institute_id_student_id_fee_structure__key" ON "student_fee_invoices"("institute_id", "student_id", "fee_structure_id", "installment_no");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_invoices_institute_id_id_key" ON "student_fee_invoices"("institute_id", "id");

-- CreateIndex
CREATE INDEX "invoice_items_institute_id_invoice_id_idx" ON "invoice_items"("institute_id", "invoice_id");

-- CreateIndex
CREATE INDEX "concessions_institute_id_student_id_academic_year_id_idx" ON "concessions"("institute_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "payments_institute_id_student_id_idx" ON "payments"("institute_id", "student_id");

-- CreateIndex
CREATE INDEX "payments_institute_id_invoice_id_idx" ON "payments"("institute_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payments_institute_id_paid_on_idx" ON "payments"("institute_id", "paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "payments_institute_id_academic_year_id_receipt_seq_key" ON "payments"("institute_id", "academic_year_id", "receipt_seq");

-- CreateIndex
CREATE UNIQUE INDEX "payments_institute_id_receipt_no_key" ON "payments"("institute_id", "receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_institute_id_id_key" ON "payments"("institute_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_reversals_institute_id_payment_id_key" ON "payment_reversals"("institute_id", "payment_id");

-- CreateIndex
CREATE INDEX "notices_institute_id_status_published_at_idx" ON "notices"("institute_id", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "notices_institute_id_id_key" ON "notices"("institute_id", "id");

-- CreateIndex
CREATE INDEX "notice_reads_institute_id_user_id_idx" ON "notice_reads"("institute_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notice_reads_institute_id_notice_id_user_id_key" ON "notice_reads"("institute_id", "notice_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_institute_id_user_id_read_at_idx" ON "notifications"("institute_id", "user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_institute_id_user_id_created_at_idx" ON "notifications"("institute_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_institute_id_user_id_fkey" FOREIGN KEY ("institute_id", "user_id") REFERENCES "users"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_institute_id_role_id_fkey" FOREIGN KEY ("institute_id", "role_id") REFERENCES "roles"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_institute_id_user_id_fkey" FOREIGN KEY ("institute_id", "user_id") REFERENCES "users"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_institute_id_role_id_fkey" FOREIGN KEY ("institute_id", "role_id") REFERENCES "roles"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_institute_id_guardian_id_fkey" FOREIGN KEY ("institute_id", "guardian_id") REFERENCES "guardians"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_institute_id_student_id_fkey" FOREIGN KEY ("institute_id", "student_id") REFERENCES "students"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_institute_id_level_id_fkey" FOREIGN KEY ("institute_id", "level_id") REFERENCES "levels"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_teacher_staff_id_fkey" FOREIGN KEY ("class_teacher_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_subjects" ADD CONSTRAINT "section_subjects_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_subjects" ADD CONSTRAINT "section_subjects_institute_id_section_id_fkey" FOREIGN KEY ("institute_id", "section_id") REFERENCES "sections"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_subjects" ADD CONSTRAINT "section_subjects_institute_id_subject_id_fkey" FOREIGN KEY ("institute_id", "subject_id") REFERENCES "subjects"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_subjects" ADD CONSTRAINT "section_subjects_teacher_staff_id_fkey" FOREIGN KEY ("teacher_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_institute_id_student_id_fkey" FOREIGN KEY ("institute_id", "student_id") REFERENCES "students"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_institute_id_section_id_fkey" FOREIGN KEY ("institute_id", "section_id") REFERENCES "sections"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_institute_id_student_id_fkey" FOREIGN KEY ("institute_id", "student_id") REFERENCES "students"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_institute_id_guardian_id_fkey" FOREIGN KEY ("institute_id", "guardian_id") REFERENCES "guardians"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_institute_id_section_id_fkey" FOREIGN KEY ("institute_id", "section_id") REFERENCES "sections"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_institute_id_attendance_session_id_date_fkey" FOREIGN KEY ("institute_id", "attendance_session_id", "date", "session") REFERENCES "attendance_sessions"("institute_id", "id", "date", "session") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_institute_id_student_id_fkey" FOREIGN KEY ("institute_id", "student_id") REFERENCES "students"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_institute_id_section_id_fkey" FOREIGN KEY ("institute_id", "section_id") REFERENCES "sections"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_institute_id_subject_id_fkey" FOREIGN KEY ("institute_id", "subject_id") REFERENCES "subjects"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_institute_id_period_id_fkey" FOREIGN KEY ("institute_id", "period_id") REFERENCES "periods"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_staff_id_fkey" FOREIGN KEY ("teacher_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structures" ADD CONSTRAINT "fee_structures_institute_id_level_id_fkey" FOREIGN KEY ("institute_id", "level_id") REFERENCES "levels"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_institute_id_fee_structure_id_fkey" FOREIGN KEY ("institute_id", "fee_structure_id") REFERENCES "fee_structures"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_items" ADD CONSTRAINT "fee_structure_items_institute_id_fee_head_id_fkey" FOREIGN KEY ("institute_id", "fee_head_id") REFERENCES "fee_heads"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_invoices" ADD CONSTRAINT "student_fee_invoices_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_invoices" ADD CONSTRAINT "student_fee_invoices_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_invoices" ADD CONSTRAINT "student_fee_invoices_institute_id_student_id_fkey" FOREIGN KEY ("institute_id", "student_id") REFERENCES "students"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_invoices" ADD CONSTRAINT "student_fee_invoices_fee_structure_id_fkey" FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_institute_id_invoice_id_fkey" FOREIGN KEY ("institute_id", "invoice_id") REFERENCES "student_fee_invoices"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_institute_id_student_id_fkey" FOREIGN KEY ("institute_id", "student_id") REFERENCES "students"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "student_fee_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concessions" ADD CONSTRAINT "concessions_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_institute_id_student_id_fkey" FOREIGN KEY ("institute_id", "student_id") REFERENCES "students"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_institute_id_invoice_id_fkey" FOREIGN KEY ("institute_id", "invoice_id") REFERENCES "student_fee_invoices"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_institute_id_payment_id_fkey" FOREIGN KEY ("institute_id", "payment_id") REFERENCES "payments"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_sequences" ADD CONSTRAINT "receipt_sequences_institute_id_academic_year_id_fkey" FOREIGN KEY ("institute_id", "academic_year_id") REFERENCES "academic_years"("institute_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_institute_id_notice_id_fkey" FOREIGN KEY ("institute_id", "notice_id") REFERENCES "notices"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_reads" ADD CONSTRAINT "notice_reads_institute_id_user_id_fkey" FOREIGN KEY ("institute_id", "user_id") REFERENCES "users"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institute_id_user_id_fkey" FOREIGN KEY ("institute_id", "user_id") REFERENCES "users"("institute_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
