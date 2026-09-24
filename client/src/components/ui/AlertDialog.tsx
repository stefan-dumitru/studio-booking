import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import type { ReactNode } from 'react';
import { Button } from './Button.js';

/**
 * The confirmation Radix's AlertDialog is for by design: an action that
 * needs an explicit yes before it happens (ui-guidelines.md > Feedback &
 * Error States: "destructive actions get a confirmation dialog before the
 * toast"). Used for archive/unarchive.
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
  confirmDisabled = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}): React.JSX.Element {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 bg-black/40" />
        <AlertDialogPrimitive.Content
          className="fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2
            rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900"
        >
          <AlertDialogPrimitive.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {description}
          </AlertDialogPrimitive.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={destructive ? 'destructive' : 'primary'}
                onClick={(event) => {
                  // Action closes the dialog on click by default (same as
                  // Cancel). That's wrong here: onConfirm's mutation is async
                  // and may fail with a conflict the admin needs to see
                  // (e.g. RESOURCE_HAS_BOOKINGS) -- preventDefault stops the
                  // auto-close, and the caller closes it explicitly on
                  // success instead (onOpenChange), leaving it open on error.
                  event.preventDefault();
                  onConfirm();
                }}
                disabled={confirmDisabled}
              >
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
