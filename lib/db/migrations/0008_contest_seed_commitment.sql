BEGIN;

-- New contests commit to a random seed before members register. The secret seed is
-- withheld from public bot responses and revealed after the draw for reproducibility.
ALTER TABLE kaguya_events
  ADD COLUMN IF NOT EXISTS draw_seed_commitment text;

CREATE INDEX IF NOT EXISTS kaguya_events_draw_commitment_idx
  ON kaguya_events (draw_seed_commitment)
  WHERE draw_seed_commitment IS NOT NULL;

COMMIT;
