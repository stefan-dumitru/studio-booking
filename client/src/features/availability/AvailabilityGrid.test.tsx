import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AvailabilityGrid } from './AvailabilityGrid.js';
import type { GridSelection } from './AvailabilityGrid.js';
import type { AvailabilityResource } from './types.js';

afterEach(() => {
  cleanup();
});

function makeResource(
  overrides: Partial<AvailabilityResource> = {},
): AvailabilityResource {
  return {
    id: 'r1',
    name: 'Room A',
    typeId: 't1',
    capacity: 4,
    slots: [
      { start: '2027-06-01T06:00:00.000Z', status: 'free', bookable: true },
      { start: '2027-06-01T06:30:00.000Z', status: 'free', bookable: true },
      { start: '2027-06-01T07:00:00.000Z', status: 'booked', bookable: false },
      { start: '2027-06-01T07:30:00.000Z', status: 'mine', bookable: false },
      {
        start: '2027-06-01T08:00:00.000Z',
        status: 'free',
        bookable: false,
        reason: 'past',
      },
    ],
    ...overrides,
  };
}

describe('AvailabilityGrid', () => {
  it('labels every cell by text, never colour alone', () => {
    render(
      <AvailabilityGrid
        resources={[makeResource()]}
        selection={null}
        onSelectionChange={vi.fn()}
      />,
    );

    // free slots show their local time, on the cell itself (09:00 also
    // appears once as the column header, so scope to gridcell).
    expect(
      screen.getByRole('gridcell', { name: /^Room A, 09:00, free$/ }),
    ).toBeInTheDocument();
    // booked/mine/past all carry their own text.
    expect(screen.getByText('Booked')).toBeInTheDocument();
    expect(screen.getByText('Yours')).toBeInTheDocument();
  });

  it('marks a non-bookable free slot with its reason in both the accessible name and the title', () => {
    render(
      <AvailabilityGrid
        resources={[makeResource()]}
        selection={null}
        onSelectionChange={vi.fn()}
      />,
    );
    // The reason must be in the accessible name too, not just the title --
    // a screen reader doesn't reliably announce `title`.
    const cell = screen.getByRole('gridcell', { name: /already passed/i });
    expect(cell).toHaveAttribute(
      'title',
      expect.stringContaining('already passed'),
    );
  });

  it('selects a single free slot on click', () => {
    const onSelectionChange = vi.fn();
    render(
      <AvailabilityGrid
        resources={[makeResource()]}
        selection={null}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByRole('gridcell', { name: /09:00/ }));

    expect(onSelectionChange).toHaveBeenCalledWith({
      resourceId: 'r1',
      slotStarts: ['2027-06-01T06:00:00.000Z'],
    });
  });

  it('does nothing when clicking a booked slot', () => {
    const onSelectionChange = vi.fn();
    render(
      <AvailabilityGrid
        resources={[makeResource()]}
        selection={null}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByRole('gridcell', { name: /booked/i }));
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('extends the selection to a shift-clicked free cell', () => {
    const resource = makeResource({
      slots: [
        { start: '2027-06-01T06:00:00.000Z', status: 'free', bookable: true },
        { start: '2027-06-01T06:30:00.000Z', status: 'free', bookable: true },
        { start: '2027-06-01T07:00:00.000Z', status: 'free', bookable: true },
        { start: '2027-06-01T07:30:00.000Z', status: 'booked', bookable: false },
      ],
    });
    let selection: GridSelection | null = null;
    const onSelectionChange = vi.fn((next: GridSelection | null) => {
      selection = next;
    });

    const { rerender } = render(
      <AvailabilityGrid
        resources={[resource]}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    rerender(
      <AvailabilityGrid
        resources={[resource]}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Shift-click the 3rd cell (still free) -- selection should cover 1st-3rd.
    fireEvent.click(screen.getAllByRole('gridcell')[2]!, { shiftKey: true });

    expect(onSelectionChange).toHaveBeenLastCalledWith({
      resourceId: 'r1',
      slotStarts: [
        '2027-06-01T06:00:00.000Z',
        '2027-06-01T06:30:00.000Z',
        '2027-06-01T07:00:00.000Z',
      ],
    });
  });

  it('caps a shift-click extension at MAX_BOOKING_SLOTS', () => {
    const resource = makeResource({
      slots: Array.from({ length: 6 }, (_, i) => ({
        start: new Date(Date.UTC(2027, 5, 1, 6, i * 30)).toISOString(),
        status: 'free' as const,
        bookable: true,
      })),
    });
    let selection: GridSelection | null = null;
    const onSelectionChange = vi.fn((next: GridSelection | null) => {
      selection = next;
    });

    const { rerender } = render(
      <AvailabilityGrid
        resources={[resource]}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getAllByRole('gridcell')[0]!);
    rerender(
      <AvailabilityGrid
        resources={[resource]}
        selection={selection}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Shift-click the 6th (last) cell -- capped at 4 slots, not 6.
    fireEvent.click(screen.getAllByRole('gridcell')[5]!, { shiftKey: true });

    expect(
      (onSelectionChange.mock.calls.at(-1)?.[0] as GridSelection).slotStarts,
    ).toHaveLength(4);
  });

  it('clears the selection on Escape', () => {
    const onSelectionChange = vi.fn();
    render(
      <AvailabilityGrid
        resources={[makeResource()]}
        selection={{ resourceId: 'r1', slotStarts: ['2027-06-01T06:00:00.000Z'] }}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.keyDown(screen.getAllByRole('gridcell')[0]!, { key: 'Escape' });
    expect(onSelectionChange).toHaveBeenCalledWith(null);
  });

  it('selects via Enter the same way click does', () => {
    const onSelectionChange = vi.fn();
    render(
      <AvailabilityGrid
        resources={[makeResource()]}
        selection={null}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.keyDown(screen.getAllByRole('gridcell')[0]!, { key: 'Enter' });

    expect(onSelectionChange).toHaveBeenCalledWith({
      resourceId: 'r1',
      slotStarts: ['2027-06-01T06:00:00.000Z'],
    });
  });
});
