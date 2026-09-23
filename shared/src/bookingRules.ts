/**
 * The numeric booking rules, in one place because both the client and the server
 * enforce them and they must not drift apart.
 *
 * The server is the only control (CLAUDE.md > Security Baseline); the client
 * imports these purely so it can grey out a slot instead of offering a click
 * that is going to fail.
 *
 * Source of truth for the values: specifications/functional.md > Use Cases.
 */

/** Bookable time is divided into fixed slots of this length. */
export const SLOT_MINUTES = 30;

/** A single booking may span at most this many contiguous slots (2 hours). */
export const MAX_BOOKING_SLOTS = 4;

/** A member may hold at most this many active bookings ending in the future. */
export const MAX_ACTIVE_BOOKINGS = 3;

/** Nothing may be booked further ahead than this. */
export const BOOKING_HORIZON_DAYS = 30;

/** A booking must start at least this long from now. */
export const MIN_NOTICE_MINUTES = 30;

/**
 * A member may not cancel within this many hours of the start time. Admins are
 * exempt, which is the escape hatch for the case below.
 *
 * Note this is deliberately longer than MIN_NOTICE_MINUTES: a member can create
 * a booking they cannot then cancel themselves. That is a known, accepted
 * consequence of the two values, not an oversight -- see
 * specifications/functional.md > Create a booking.
 */
export const CANCEL_CUTOFF_HOURS = 2;

/** The longest a single booking can run, derived rather than stated twice. */
export const MAX_BOOKING_MINUTES = MAX_BOOKING_SLOTS * SLOT_MINUTES;
