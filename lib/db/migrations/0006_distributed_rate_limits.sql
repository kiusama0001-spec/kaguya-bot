BEGIN;

CREATE TABLE IF NOT EXISTS kaguya_rate_limits (
  scope_key text PRIMARY KEY,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  hit_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  notice_sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE kaguya_rate_limits ADD COLUMN IF NOT EXISTS notice_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS kaguya_rate_limits_updated_idx ON kaguya_rate_limits (updated_at);

COMMIT;
