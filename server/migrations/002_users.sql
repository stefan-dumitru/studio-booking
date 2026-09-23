-- Up Migration

CREATE TABLE users (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             CITEXT      NOT NULL UNIQUE,
  password_hash     TEXT        NOT NULL,
  display_name      TEXT        NOT NULL,
  role              TEXT        NOT NULL DEFAULT 'member',
  status            TEXT        NOT NULL DEFAULT 'pending_verification',
  email_verified_at TIMESTAMPTZ,
  deactivated_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_display_name_length
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  CONSTRAINT users_email_shape
    CHECK (position('@' IN email) > 1),
  CONSTRAINT users_role_valid
    CHECK (role IN ('member', 'admin')),
  CONSTRAINT users_status_valid
    CHECK (status IN ('pending_verification', 'active', 'deactivated')),
  -- A deactivated account must record when, so the admin list can answer
  -- "since when" and not just "what now".
  CONSTRAINT users_deactivated_has_timestamp
    CHECK ((status = 'deactivated') = (deactivated_at IS NOT NULL))
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE users IS
  'Every account. An admin is a member with extra rights, not a separate table.';

-- Down Migration

DROP TABLE users;
