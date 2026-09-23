-- Up Migration

-- citext gives case-insensitive uniqueness for email and resource-type names,
-- so ana@x.com and Ana@X.com cannot become two accounts.
CREATE EXTENSION IF NOT EXISTS citext;

-- Keeps updated_at honest without every UPDATE statement having to remember it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

DROP FUNCTION IF EXISTS set_updated_at();
-- citext is deliberately not dropped: other databases on this server may use it.
