BEGIN;

-- Backwards-compatible fields: existing payment/event data remains untouched.
ALTER TABLE kaguya_client_payments
  ADD COLUMN IF NOT EXISTS idempotency_key uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS kaguya_client_payments_idempotency_idx
  ON kaguya_client_payments (idempotency_key);

ALTER TABLE kaguya_events
  ADD COLUMN IF NOT EXISTS recurrence_rule text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS series_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS recurrence_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS draw_seed text,
  ADD COLUMN IF NOT EXISTS participant_hash text,
  ADD COLUMN IF NOT EXISTS draw_algorithm text;
CREATE UNIQUE INDEX IF NOT EXISTS kaguya_events_series_index_idx
  ON kaguya_events (series_id, recurrence_index);

CREATE TABLE IF NOT EXISTS kaguya_rent_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES kaguya_clients(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'cancelled')),
  notification_attempts integer NOT NULL DEFAULT 0,
  last_notification_claimed_at timestamptz,
  last_notification_sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, period)
);
CREATE INDEX IF NOT EXISTS kaguya_rent_invoices_due_idx
  ON kaguya_rent_invoices (status, due_at);

COMMIT;
