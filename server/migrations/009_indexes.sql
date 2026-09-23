-- Up Migration

-- Priorities from specifications/performance.md > Database indexing priorities.
-- booking_slots' own primary key is priority 1 and already exists (006).

-- "My bookings", and the 3-active-bookings cap count.
CREATE INDEX bookings_member_starts_idx
  ON bookings (member_id, starts_at DESC);

-- "Does this resource have future bookings" -- the archive block and the
-- stranded-booking check on an hours edit. Partial because a cancelled booking
-- is never the answer.
CREATE INDEX bookings_resource_future_idx
  ON bookings (resource_id, ends_at)
  WHERE status = 'booked';

-- Keyset pagination on the admin booking list.
CREATE INDEX bookings_starts_at_id_idx
  ON bookings (starts_at DESC, id);

-- The nightly retention purge's scan.
CREATE INDEX bookings_ends_at_active_idx
  ON bookings (ends_at)
  WHERE status = 'booked';

-- The browse view's type filter.
CREATE INDEX resources_type_active_idx
  ON resources (type_id)
  WHERE archived_at IS NULL;

-- Invalidating a user's outstanding tokens when a new one is issued.
CREATE INDEX email_tokens_user_purpose_idx
  ON email_tokens (user_id, purpose);

CREATE INDEX audit_log_occurred_at_idx
  ON audit_log (occurred_at DESC);

CREATE INDEX audit_log_target_idx
  ON audit_log (target_type, target_id);

-- Down Migration

DROP INDEX audit_log_target_idx;
DROP INDEX audit_log_occurred_at_idx;
DROP INDEX email_tokens_user_purpose_idx;
DROP INDEX resources_type_active_idx;
DROP INDEX bookings_ends_at_active_idx;
DROP INDEX bookings_starts_at_id_idx;
DROP INDEX bookings_resource_future_idx;
DROP INDEX bookings_member_starts_idx;
