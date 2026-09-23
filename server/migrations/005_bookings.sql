-- Up Migration

CREATE TABLE bookings (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_id  BIGINT      NOT NULL REFERENCES resources (id) ON DELETE RESTRICT,
  member_id    BIGINT      NOT NULL REFERENCES users (id)     ON DELETE RESTRICT,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'booked',
  cancelled_at TIMESTAMPTZ,
  cancelled_by BIGINT      REFERENCES users (id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bookings_status_valid
    CHECK (status IN ('booked', 'cancelled')),
  CONSTRAINT bookings_ends_after_starts
    CHECK (ends_at > starts_at),
  CONSTRAINT bookings_max_duration
    CHECK (ends_at - starts_at <= INTERVAL '2 hours'),
  -- Alignment is checked against UTC explicitly rather than via date_part on a
  -- timestamptz: the latter depends on the session TimeZone and so is STABLE,
  -- which Postgres will not accept in a CHECK. "AT TIME ZONE 'UTC'" with a
  -- literal zone is immutable.
  CONSTRAINT bookings_starts_on_slot_boundary
    CHECK (
      date_part('minute', starts_at AT TIME ZONE 'UTC') IN (0, 30)
      AND date_part('second', starts_at AT TIME ZONE 'UTC') = 0
    ),
  CONSTRAINT bookings_ends_on_slot_boundary
    CHECK (
      date_part('minute', ends_at AT TIME ZONE 'UTC') IN (0, 30)
      AND date_part('second', ends_at AT TIME ZONE 'UTC') = 0
    ),
  CONSTRAINT bookings_cancellation_fields_consistent
    CHECK (
      (status = 'cancelled')
        = (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
    ),

  -- Not redundant with the primary key: this is the target of booking_slots'
  -- composite foreign key, which is what stops the two tables disagreeing
  -- about which resource a booking is on.
  CONSTRAINT bookings_id_resource_unique UNIQUE (id, resource_id)
);

COMMENT ON TABLE bookings IS
  'Transactional. Created and cancelled, never updated in place. The 3-booking '
  'cap and 30-day horizon are application-level -- they depend on now() and on '
  'a count across rows, so they cannot be table constraints.';

-- Down Migration

DROP TABLE bookings;
