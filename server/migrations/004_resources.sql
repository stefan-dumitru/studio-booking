-- Up Migration

CREATE TABLE resources (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT        NOT NULL,
  type_id     BIGINT      NOT NULL REFERENCES resource_types (id) ON DELETE RESTRICT,
  description TEXT        NOT NULL DEFAULT '',
  capacity    INTEGER     NOT NULL,
  open_time   TIME        NOT NULL,
  close_time  TIME        NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT resources_name_length
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT resources_capacity_positive
    CHECK (capacity >= 1),
  -- Overnight opening windows are not supported. Adding them is a schema
  -- change, not a config change -- see specifications/data-model.md.
  CONSTRAINT resources_hours_ordered
    CHECK (close_time > open_time)
);

CREATE TRIGGER resources_set_updated_at
  BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON COLUMN resources.capacity IS
  'Descriptive only. Never read by the booking conflict check: one active '
  'booking per resource per slot, enforced by booking_slots.';
COMMENT ON COLUMN resources.open_time IS
  'Studio-local wall clock (see STUDIO_TIME_ZONE), not UTC.';

-- Down Migration

DROP TABLE resources;
