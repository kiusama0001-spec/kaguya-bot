BEGIN;

-- Additive migration: keep existing sanctions, reminders, and user settings intact.
ALTER TABLE kaguya_sanctions
  ADD COLUMN IF NOT EXISTS previous_status text;

ALTER TABLE kaguya_reminders
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE kaguya_reminders
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS kaguya_reminders_claimed_idx
  ON kaguya_reminders (status, claimed_at);

COMMIT;
