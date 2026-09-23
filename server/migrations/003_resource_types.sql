-- Up Migration

CREATE TABLE resource_types (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        CITEXT      NOT NULL UNIQUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT resource_types_name_length
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
);

CREATE TRIGGER resource_types_set_updated_at
  BEFORE UPDATE ON resource_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE resource_types IS
  'Admin-managed vocabulary driving the browse filter. No seed values yet.';

-- Down Migration

DROP TABLE resource_types;
