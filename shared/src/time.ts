/**
 * The studio is one physical room with one wall clock, so every member sees the
 * same local time regardless of their device's zone.
 *
 * Every timestamp is stored in UTC (CLAUDE.md > Code Style); this zone is used
 * for display and for resolving a resource's opening hours to real instants.
 */
export const STUDIO_TIME_ZONE = 'Europe/Bucharest';
