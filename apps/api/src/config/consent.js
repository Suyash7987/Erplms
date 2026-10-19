/**
 * DPDP parental consent. Bump CONSENT_VERSION when the consent text (apps/web i18n `consent.*`)
 * changes materially; parents are then asked again on their next login.
 */
const CONSENT_PURPOSE = 'student_data_processing';
const CONSENT_VERSION = '2026-10';

module.exports = { CONSENT_PURPOSE, CONSENT_VERSION };
