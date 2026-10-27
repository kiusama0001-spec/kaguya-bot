BEGIN;

CREATE TABLE IF NOT EXISTS kaguya_groups (
  chat_id text PRIMARY KEY,
  title text NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kaguya_group_members (
  chat_id text NOT NULL REFERENCES kaguya_groups(chat_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  username text,
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS kaguya_group_members_search_idx
  ON kaguya_group_members (chat_id, username);

CREATE TABLE IF NOT EXISTS kaguya_group_settings (
  group_id text PRIMARY KEY REFERENCES kaguya_groups(chat_id) ON DELETE CASCADE,
  ai_enabled boolean NOT NULL DEFAULT true,
  moderation_enabled boolean NOT NULL DEFAULT true,
  anti_flood_enabled boolean NOT NULL DEFAULT true,
  welcome_text text NOT NULL DEFAULT '',
  goodbye_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kaguya_sanctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id text NOT NULL REFERENCES kaguya_groups(chat_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  username text,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  reason text,
  actor text,
  permissions_snapshot jsonb,
  previous_until_date integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  restored_at timestamptz
);
CREATE INDEX IF NOT EXISTS kaguya_sanctions_group_status_idx
  ON kaguya_sanctions (group_id, status, created_at);
CREATE INDEX IF NOT EXISTS kaguya_sanctions_expiry_idx
  ON kaguya_sanctions (status, expires_at);

CREATE TABLE IF NOT EXISTS kaguya_message_templates (
  type text NOT NULL,
  group_id text REFERENCES kaguya_groups(chat_id) ON DELETE CASCADE,
  text text NOT NULL DEFAULT '',
  image_file_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kaguya_message_templates_scope_idx
  ON kaguya_message_templates (type, group_id);

CREATE TABLE IF NOT EXISTS kaguya_bot_settings (
  id text PRIMARY KEY DEFAULT 'main',
  ai_enabled boolean NOT NULL DEFAULT true,
  personality text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kaguya_phrases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  tone text NOT NULL DEFAULT 'neutral',
  text text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kaguya_phrases_category_idx
  ON kaguya_phrases (category, enabled);

CREATE TABLE IF NOT EXISTS kaguya_gifs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  file_id text NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kaguya_gifs_category_file_idx
  ON kaguya_gifs (category, file_id);

CREATE TABLE IF NOT EXISTS kaguya_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  text text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS kaguya_reminders_due_idx
  ON kaguya_reminders (status, due_at);

CREATE TABLE IF NOT EXISTS kaguya_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  summary text NOT NULL,
  actor text,
  group_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kaguya_activity_created_idx
  ON kaguya_activity_log (created_at);

CREATE TABLE IF NOT EXISTS kaguya_conversation_memory (
  chat_id text NOT NULL,
  user_id text NOT NULL,
  memory_enabled boolean NOT NULL DEFAULT false,
  summary text NOT NULL DEFAULT '',
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS kaguya_bot_runtime (
  id text PRIMARY KEY DEFAULT 'poller',
  next_update_offset integer NOT NULL DEFAULT 0,
  last_successful_poll_at timestamptz
);

COMMIT;
