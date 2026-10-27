-- Stable keys make the 10,000-row Kaguya phrase corpus idempotent without deleting history.
ALTER TABLE kaguya_phrases ADD COLUMN IF NOT EXISTS seed_key text;
CREATE UNIQUE INDEX IF NOT EXISTS kaguya_phrases_seed_key_uidx ON kaguya_phrases (seed_key);
