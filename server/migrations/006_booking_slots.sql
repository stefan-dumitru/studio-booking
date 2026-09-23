-- Up Migration

-- This table is the entire double-booking defence. The primary key below is the
-- guarantee; the availability check in application code only exists to produce a
-- friendlier error. See specifications/operations.md > Concurrency.
CREATE TABLE booking_slots (
  booking_id  BIGINT      NOT NULL,
  resource_id BIGINT      NOT NULL,
  slot_start  TIMESTAMPTZ NOT NULL,

  CONSTRAINT booking_slots_pkey PRIMARY KEY (resource_id, slot_start),

  -- Composite rather than a plain booking_id reference: it keeps the
  -- denormalised resource_id identical to the booking's own.
  CONSTRAINT booking_slots_booking_fkey
    FOREIGN KEY (booking_id, resource_id)
    REFERENCES bookings (id, resource_id)
    ON DELETE CASCADE,

  CONSTRAINT booking_slots_on_slot_boundary
    CHECK (
      date_part('minute', slot_start AT TIME ZONE 'UTC') IN (0, 30)
      AND date_part('second', slot_start AT TIME ZONE 'UTC') = 0
    )
);

-- Cancellation deletes a booking's slots by booking_id, which is what frees
-- them; without this it would be a sequential scan.
CREATE INDEX booking_slots_booking_id_idx ON booking_slots (booking_id);

COMMENT ON TABLE booking_slots IS
  'One row per 30-minute slot a LIVE booking occupies. Rows are deleted on '
  'cancellation -- that deletion is what frees the slot. A cancelled booking '
  'has zero rows here; its bookings row survives as history.';

-- Down Migration

DROP TABLE booking_slots;
