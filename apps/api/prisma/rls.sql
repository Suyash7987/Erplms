-- Row Level Security and database-level guards for every tenant table.
--
-- This file is the source of truth; it is applied by the prisma/migrations/*_tenant_rls migration,
-- which must stay identical (tests/unit/rls-sql.test.js checks this). New tenant tables need a line
-- in a new migration (and here) calling app_enable_tenant_rls(); the integration tests fail otherwise.
--
-- How it works
-- - The API runs each request in a transaction that calls
--     SELECT set_config('app.institute_id', '<institute uuid from the verified JWT>', true)
--   (the parameterised form of SET LOCAL). Policies compare institute_id with that value.
-- - FORCE ROW LEVEL SECURITY applies the policies to the table owner too, so the app role (which
--   owns the tables) is restricted. Superusers and BYPASSRLS roles still bypass RLS, so the app must
--   never connect as one.
-- - Without a tenant context every tenant table returns no rows and rejects writes (fail closed).
-- - The only exception is `app.platform = 'on'`, which allows SELECT on `institutes` alone so login
--   can resolve an institute code before a tenant is known.

CREATE OR REPLACE FUNCTION app_current_institute_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.institute_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.platform', true), '') = 'on'
$$;

-- Standard tenant table: all commands limited to the current institute.
CREATE OR REPLACE FUNCTION app_enable_tenant_rls(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s
       USING (institute_id = app_current_institute_id())
       WITH CHECK (institute_id = app_current_institute_id())',
    target
  );
END;
$$;

-- Append-only tenant table: only SELECT and INSERT policies, plus a trigger that raises on
-- UPDATE, DELETE and TRUNCATE so mistakes fail loudly instead of silently matching zero rows.
CREATE OR REPLACE FUNCTION app_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION app_enable_append_only_rls(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format(
    'CREATE POLICY tenant_read ON %s FOR SELECT
       USING (institute_id = app_current_institute_id())',
    target
  );
  EXECUTE format(
    'CREATE POLICY tenant_insert ON %s FOR INSERT
       WITH CHECK (institute_id = app_current_institute_id())',
    target
  );
  EXECUTE format(
    'CREATE TRIGGER append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON %s
       FOR EACH STATEMENT EXECUTE FUNCTION app_reject_mutation()',
    target
  );
END;
$$;

-- Institutes: the tenant row itself (keyed by id, not institute_id).
ALTER TABLE institutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON institutes
  USING (id = app_current_institute_id())
  WITH CHECK (id = app_current_institute_id());
CREATE POLICY platform_lookup ON institutes FOR SELECT
  USING (app_is_platform());

-- Tenant and access
SELECT app_enable_tenant_rls('users');
SELECT app_enable_tenant_rls('refresh_tokens');
SELECT app_enable_tenant_rls('roles');
SELECT app_enable_tenant_rls('role_permissions');
SELECT app_enable_tenant_rls('user_roles');
SELECT app_enable_append_only_rls('audit_logs');
SELECT app_enable_tenant_rls('consents');

-- Academic structure
SELECT app_enable_tenant_rls('academic_years');
SELECT app_enable_tenant_rls('levels');
SELECT app_enable_tenant_rls('sections');
SELECT app_enable_tenant_rls('subjects');
SELECT app_enable_tenant_rls('section_subjects');

-- People
SELECT app_enable_tenant_rls('students');
SELECT app_enable_tenant_rls('student_enrollments');
SELECT app_enable_tenant_rls('guardians');
SELECT app_enable_tenant_rls('student_guardians');
SELECT app_enable_tenant_rls('staff');

-- Operations
SELECT app_enable_tenant_rls('attendance_sessions');
SELECT app_enable_tenant_rls('attendance_records');
SELECT app_enable_tenant_rls('leaves');
SELECT app_enable_tenant_rls('periods');
SELECT app_enable_tenant_rls('timetable_slots');

-- Finance
SELECT app_enable_tenant_rls('fee_heads');
SELECT app_enable_tenant_rls('fee_structures');
SELECT app_enable_tenant_rls('fee_structure_items');
SELECT app_enable_tenant_rls('student_fee_invoices');
SELECT app_enable_tenant_rls('invoice_items');
SELECT app_enable_tenant_rls('concessions');
SELECT app_enable_append_only_rls('payments');
SELECT app_enable_append_only_rls('payment_reversals');
SELECT app_enable_tenant_rls('receipt_sequences');

-- Communication
SELECT app_enable_tenant_rls('notices');
SELECT app_enable_tenant_rls('notice_reads');
SELECT app_enable_tenant_rls('notifications');
