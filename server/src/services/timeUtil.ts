/**
 * Formats a known UTC instant as a studio-local "YYYY-MM-DD" calendar date.
 * Safe and unambiguous in a way the reverse (local date -> UTC instant)
 * isn't: an instant always names exactly one wall-clock moment in any zone,
 * so there's no DST edge case here -- that's why this uses Intl directly
 * instead of going through SQL like the local->UTC direction does
 * (functional.md > Slot generation & DST).
 *
 * en-CA is a deliberate locale choice, not a region assumption: its default
 * date format happens to be YYYY-MM-DD, which avoids manually reassembling
 * Intl's date parts.
 */
export function localDateStringInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
