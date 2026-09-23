-- Up Migration

CREATE TABLE audit_log (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- RESTRICT, not CASCADE: an audit row must not vanish because a user row did.
  -- GDPR erasure nulls this column rather than deleting the row.
  actor_id              BIGINT      REFERENCES users (id) ON DELETE RESTRICT,
  -- Set instead of actor_id when a login fails against an unknown email.
  actor_email_attempted TEXT,
  action                TEXT        NOT NULL,
  target_type           TEXT        NOT NULL DEFAULT '',
  target_id             BIGINT,
  detail                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip                    INET,

  CONSTRAINT audit_log_action_not_blank
    CHECK (char_length(btrim(action)) > 0),
  CONSTRAINT audit_log_target_type_valid
    CHECK (target_type IN ('', 'booking', 'user', 'resource', 'resource_type'))
);

COMMENT ON TABLE audit_log IS
  'Security-relevant events only: auth, admin actions on other people''s data, '
  'resource lifecycle. Deliberately NOT a booking history -- the bookings row '
  'already records who cancelled and when. Written in the same transaction as '
  'the action it describes.';
COMMENT ON COLUMN audit_log.ip IS
  'Personal data under GDPR. Drives the retention TODO in security.md.';

-- Down Migration

DROP TABLE audit_log;
