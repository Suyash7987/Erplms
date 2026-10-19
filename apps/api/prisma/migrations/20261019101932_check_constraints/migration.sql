-- CHECK constraints that Prisma schema cannot express. Prisma Migrate leaves them in place.

-- Tenant and access
ALTER TABLE users
  ADD CONSTRAINT users_phone_format CHECK (phone ~ '^[0-9]{10,15}$'),
  ADD CONSTRAINT users_failed_attempts_non_negative CHECK (failed_attempts >= 0);

ALTER TABLE institutes
  ADD CONSTRAINT institutes_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$');

-- Academic structure
ALTER TABLE academic_years
  ADD CONSTRAINT academic_years_date_order CHECK (end_date > start_date);

ALTER TABLE sections
  ADD CONSTRAINT sections_capacity_positive CHECK (capacity IS NULL OR capacity > 0);

-- People
ALTER TABLE student_enrollments
  ADD CONSTRAINT student_enrollments_roll_no_positive CHECK (roll_no IS NULL OR roll_no > 0),
  ADD CONSTRAINT student_enrollments_date_order CHECK (left_on IS NULL OR enrolled_on IS NULL OR left_on >= enrolled_on);

-- Operations
ALTER TABLE leaves
  ADD CONSTRAINT leaves_one_applicant CHECK (num_nonnulls(student_id, staff_id) = 1),
  ADD CONSTRAINT leaves_date_order CHECK (to_date >= from_date);

ALTER TABLE periods
  ADD CONSTRAINT periods_period_no_positive CHECK (period_no > 0),
  ADD CONSTRAINT periods_time_format CHECK (
    start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  ADD CONSTRAINT periods_time_order CHECK (end_time > start_time);

ALTER TABLE timetable_slots
  ADD CONSTRAINT timetable_slots_day_of_week CHECK (day_of_week BETWEEN 1 AND 7),
  ADD CONSTRAINT timetable_slots_time_format CHECK (
    start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  ADD CONSTRAINT timetable_slots_time_order CHECK (end_time > start_time);

-- Finance (amounts in paise)
ALTER TABLE fee_structure_items
  ADD CONSTRAINT fee_structure_items_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT fee_structure_items_installment_positive CHECK (installment_no > 0),
  ADD CONSTRAINT fee_structure_items_late_fine_non_negative CHECK (late_fine_amount_paise >= 0 AND late_fine_grace_days >= 0);

ALTER TABLE student_fee_invoices
  ADD CONSTRAINT student_fee_invoices_amounts_non_negative CHECK (
    gross_paise >= 0 AND concession_paise >= 0 AND fine_paise >= 0 AND net_paise >= 0
  ),
  ADD CONSTRAINT student_fee_invoices_net_matches CHECK (net_paise = gross_paise - concession_paise + fine_paise),
  ADD CONSTRAINT student_fee_invoices_paid_range CHECK (paid_paise >= 0 AND paid_paise <= net_paise),
  ADD CONSTRAINT student_fee_invoices_installment_positive CHECK (installment_no > 0);

ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_amount_non_negative CHECK (amount_paise >= 0);

ALTER TABLE concessions
  ADD CONSTRAINT concessions_one_value CHECK (num_nonnulls(percent_basis_points, amount_paise) = 1),
  ADD CONSTRAINT concessions_percent_range CHECK (percent_basis_points IS NULL OR percent_basis_points BETWEEN 1 AND 10000),
  ADD CONSTRAINT concessions_amount_positive CHECK (amount_paise IS NULL OR amount_paise > 0);

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount_paise > 0),
  ADD CONSTRAINT payments_receipt_seq_positive CHECK (receipt_seq > 0),
  ADD CONSTRAINT payments_reference_required CHECK (
    mode = 'cash' OR (reference_no IS NOT NULL AND btrim(reference_no) <> '')
  );

ALTER TABLE payment_reversals
  ADD CONSTRAINT payment_reversals_amount_positive CHECK (amount_paise > 0);

ALTER TABLE receipt_sequences
  ADD CONSTRAINT receipt_sequences_last_value_non_negative CHECK (last_value >= 0);
