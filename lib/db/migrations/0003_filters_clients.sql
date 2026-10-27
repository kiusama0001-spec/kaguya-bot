BEGIN;

CREATE TABLE IF NOT EXISTS kaguya_group_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL REFERENCES kaguya_groups(chat_id) ON DELETE CASCADE,
  pattern text NOT NULL,
  is_exception boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kaguya_group_filters_lookup_idx
  ON kaguya_group_filters (group_id, enabled);

CREATE TABLE IF NOT EXISTS kaguya_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text,
  telegram_chat_id text,
  notes text NOT NULL DEFAULT '',
  rent_amount_cents integer NOT NULL DEFAULT 0 CHECK (rent_amount_cents >= 0),
  due_day integer NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kaguya_clients_status_due_idx
  ON kaguya_clients (status, due_day);

CREATE TABLE IF NOT EXISTS kaguya_client_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES kaguya_clients(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  period text,
  method text NOT NULL DEFAULT 'other',
  notes text NOT NULL DEFAULT '',
  paid_at timestamptz NOT NULL DEFAULT now(),
  actor text
);
CREATE INDEX IF NOT EXISTS kaguya_client_payments_client_paid_idx
  ON kaguya_client_payments (client_id, paid_at);

COMMIT;
