import { useCallback, useRef, useState } from 'react';
import { MAX_BOOKING_SLOTS, STUDIO_TIME_ZONE } from '@studio/shared';
import type { AvailabilityResource, AvailabilitySlot } from './types.js';

export interface GridSelection {
  readonly resourceId: string;
  readonly slotStarts: readonly string[];
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: STUDIO_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function localTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

function cellLabel(slot: AvailabilitySlot): string {
  if (slot.status === 'mine') return 'Yours';
  if (slot.status === 'booked') return 'Booked';
  return localTime(slot.start);
}

/**
 * Never signals free/booked/mine by colour alone (ui-guidelines.md >
 * Accessibility) -- every cell's own text already does that (cellLabel
 * above); this only adds the hatched fill booked cells get on top of it.
 */
function cellClassName(slot: AvailabilitySlot, isSelected: boolean): string {
  const base =
    'flex h-11 min-w-16 items-center justify-center border border-slate-200 text-xs ' +
    'dark:border-slate-800';

  if (slot.status === 'mine') {
    return `${base} bg-blue-100 font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-200`;
  }
  if (slot.status === 'booked') {
    return (
      `${base} text-slate-500 dark:text-slate-400 ` +
      'bg-[repeating-linear-gradient(45deg,theme(colors.slate.200),theme(colors.slate.200)_4px,transparent_4px,transparent_8px)] ' +
      'dark:bg-[repeating-linear-gradient(45deg,theme(colors.slate.800),theme(colors.slate.800)_4px,transparent_4px,transparent_8px)]'
    );
  }
  if (!slot.bookable) {
    return `${base} cursor-not-allowed text-slate-300 dark:text-slate-700`;
  }
  if (isSelected) {
    return `${base} cursor-pointer bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900`;
  }
  return `${base} cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900`;
}

function unbookableReasonText(slot: AvailabilitySlot): string | undefined {
  if (slot.bookable || slot.status !== 'free') return undefined;
  switch (slot.reason) {
    case 'past':
      return 'This time has already passed.';
    case 'too_soon':
      return 'Too close to now to book.';
    case 'beyond_horizon':
      return 'Too far ahead to book yet.';
    default:
      return undefined;
  }
}

/**
 * A sighted user sees the reason via the `title` tooltip on hover/focus, but
 * a screen reader doesn't reliably announce `title` -- without this, a
 * non-bookable free slot would announce as plain "free", indistinguishable
 * from one that can actually be selected. Folding the reason into the
 * accessible name itself fixes that.
 */
function cellAccessibleLabel(resourceName: string, slot: AvailabilitySlot): string {
  const reasonText = unbookableReasonText(slot);
  const base = `${resourceName}, ${localTime(slot.start)}, ${slot.status}`;
  return reasonText ? `${base}, ${reasonText}` : base;
}

/** The contiguous run of slot indices between two points on one resource,
 * capped at MAX_BOOKING_SLOTS and stopped at the first non-bookable-free cell. */
function contiguousRange(
  slots: readonly AvailabilitySlot[],
  anchor: number,
  extendTo: number,
): number[] {
  const lo = Math.min(anchor, extendTo);
  const hi = Math.max(anchor, extendTo);
  const indices: number[] = [];
  for (let i = lo; i <= hi && indices.length < MAX_BOOKING_SLOTS; i += 1) {
    const slot = slots[i];
    if (!slot || slot.status !== 'free' || !slot.bookable) break;
    indices.push(i);
  }
  return indices;
}

export function AvailabilityGrid({
  resources,
  selection,
  onSelectionChange,
}: {
  resources: readonly AvailabilityResource[];
  selection: GridSelection | null;
  onSelectionChange: (selection: GridSelection | null) => void;
}): React.JSX.Element {
  const [focused, setFocused] = useState<{ row: number; col: number }>({
    row: 0,
    col: 0,
  });
  const anchorRef = useRef<number | null>(null);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const slotCount = resources[0]?.slots.length ?? 0;

  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current.get(`${row}:${col}`);
    el?.focus();
    setFocused({ row, col });
  }, []);

  function selectRange(
    resourceIndex: number,
    anchor: number,
    extendTo: number,
  ): void {
    const resource = resources[resourceIndex];
    if (!resource) return;
    const indices = contiguousRange(resource.slots, anchor, extendTo);
    if (indices.length === 0) {
      onSelectionChange(null);
      return;
    }
    onSelectionChange({
      resourceId: resource.id,
      slotStarts: indices.map((i) => resource.slots[i]!.start),
    });
  }

  function handleCellClick(
    resourceIndex: number,
    slotIndex: number,
    shiftKey: boolean,
  ): void {
    const resource = resources[resourceIndex];
    const slot = resource?.slots[slotIndex];
    if (!resource || !slot || slot.status !== 'free' || !slot.bookable) return;

    focusCell(resourceIndex, slotIndex);

    const sameResourceSelected = selection?.resourceId === resource.id;
    if (shiftKey && sameResourceSelected && anchorRef.current !== null) {
      selectRange(resourceIndex, anchorRef.current, slotIndex);
    } else {
      anchorRef.current = slotIndex;
      selectRange(resourceIndex, slotIndex, slotIndex);
    }
  }

  function handleKeyDown(
    event: React.KeyboardEvent,
    resourceIndex: number,
    slotIndex: number,
  ): void {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        if (slotIndex + 1 < slotCount) focusCell(resourceIndex, slotIndex + 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (slotIndex - 1 >= 0) focusCell(resourceIndex, slotIndex - 1);
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (resourceIndex + 1 < resources.length)
          focusCell(resourceIndex + 1, slotIndex);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (resourceIndex - 1 >= 0) focusCell(resourceIndex - 1, slotIndex);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleCellClick(resourceIndex, slotIndex, event.shiftKey);
        break;
      case 'Escape':
        event.preventDefault();
        anchorRef.current = null;
        onSelectionChange(null);
        break;
      default:
        break;
    }
  }

  if (resources.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        No resources match these filters.
      </p>
    );
  }

  return (
    <div
      role="grid"
      aria-label="Resource availability"
      aria-rowcount={resources.length + 1}
      aria-colcount={slotCount + 1}
      className="mt-4 overflow-x-auto"
    >
      <div role="row" className="flex sticky top-0 z-10 bg-white dark:bg-slate-950">
        <div className="sticky left-0 z-10 flex h-11 w-36 shrink-0 items-center bg-white px-2 text-xs font-medium dark:bg-slate-950">
          Resource
        </div>
        {resources[0]?.slots.map((slot) => (
          <div
            key={slot.start}
            role="columnheader"
            className="flex h-11 min-w-16 items-center justify-center text-xs font-medium text-slate-500"
          >
            {localTime(slot.start)}
          </div>
        ))}
      </div>

      {resources.map((resource, resourceIndex) => (
        <div role="row" key={resource.id} className="flex">
          <div
            role="rowheader"
            className="sticky left-0 z-10 flex h-11 w-36 shrink-0 items-center bg-white px-2 text-sm dark:bg-slate-950"
          >
            {resource.name}
          </div>
          {resource.slots.map((slot, slotIndex) => {
            const isSelected =
              selection?.resourceId === resource.id &&
              selection.slotStarts.includes(slot.start);
            const isFocused =
              focused.row === resourceIndex && focused.col === slotIndex;

            return (
              <div
                key={slot.start}
                ref={(el) => {
                  if (el) cellRefs.current.set(`${resourceIndex}:${slotIndex}`, el);
                  else cellRefs.current.delete(`${resourceIndex}:${slotIndex}`);
                }}
                role="gridcell"
                aria-selected={isSelected}
                aria-label={cellAccessibleLabel(resource.name, slot)}
                title={unbookableReasonText(slot)}
                tabIndex={isFocused ? 0 : -1}
                className={cellClassName(slot, isSelected)}
                onClick={(event) =>
                  handleCellClick(resourceIndex, slotIndex, event.shiftKey)
                }
                onKeyDown={(event) =>
                  handleKeyDown(event, resourceIndex, slotIndex)
                }
                onFocus={() => setFocused({ row: resourceIndex, col: slotIndex })}
              >
                {cellLabel(slot)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
