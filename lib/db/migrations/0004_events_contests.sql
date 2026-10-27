BEGIN;

CREATE TABLE IF NOT EXISTS kaguya_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL REFERENCES kaguya_groups(chat_id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  description text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'event' CHECK (kind IN ('event', 'contest')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closes_at timestamptz,
  winner_user_id text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS kaguya_events_group_status_idx
  ON kaguya_events (group_id, status, closes_at);

CREATE TABLE IF NOT EXISTS kaguya_event_participants (
  event_id uuid NOT NULL REFERENCES kaguya_events(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  username text,
  full_name text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS kaguya_event_participants_user_idx
  ON kaguya_event_participants (user_id, joined_at);

COMMIT;
