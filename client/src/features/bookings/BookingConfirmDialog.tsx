import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CANCEL_CUTOFF_HOURS, STUDIO_TIME_ZONE } from '@studio/shared';
import { Dialog } from '../../components/ui/Dialog.js';
import { Button } from '../../components/ui/Button.js';
import { ApiError } from '../../lib/apiClient.js';
import { useToast } from '../../components/ui/Toast.js';
import * as api from './api.js';

const rangeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: STUDIO_TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function BookingConfirmDialog({
  resourceName,
  resourceId,
  startsAt,
  endsAt,
  csrfToken,
  /** Captured by the caller at the moment it decided to open this dialog
   * (an event handler, not a render body) -- reading the current time
   * directly during render is impure, which the react-hooks lint rule
   * correctly flags; this pushes that read out to where it's legitimate. */
  openedAtMs,
  onClose,
  onBooked,
}: {
  resourceName: string;
  resourceId: string;
  startsAt: string;
  endsAt: string;
  csrfToken: string;
  openedAtMs: number;
  onClose: () => void;
  onBooked: () => void;
}): React.JSX.Element {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const startsWithinCutoff =
    new Date(startsAt).getTime() - openedAtMs <
    CANCEL_CUTOFF_HOURS * 60 * 60 * 1000;

  const mutation = useMutation({
    mutationFn: () =>
      api.createBooking({ resourceId, startsAt, endsAt }, csrfToken),
    onSuccess: () => {
      showToast('Booked.');
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      onBooked();
    },
    onError: () => {
      // Whether it's SLOT_TAKEN or anything else, the grid underneath still
      // needs to reflect reality -- ui-guidelines.md > Key Flows: "the grid
      // refetches beneath it" even while the dialog stays open on a conflict.
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  const isSlotTaken =
    mutation.error instanceof ApiError && mutation.error.code === 'SLOT_TAKEN';
  const errorMessage =
    mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Confirm booking"
    >
      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        <strong>{resourceName}</strong>
        <br />
        {rangeFormatter.format(new Date(startsAt))} –{' '}
        {rangeFormatter.format(new Date(endsAt))}
      </p>

      {startsWithinCutoff && (
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950">
          This starts in under {CANCEL_CUTOFF_HOURS} hours — you won&rsquo;t be able
          to cancel it yourself once booked. Ask the studio admin if you need to.
        </p>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {isSlotTaken
            ? 'Someone just took this slot. Pick another.'
            : errorMessage}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Booking…' : 'Confirm'}
        </Button>
      </div>
    </Dialog>
  );
}
