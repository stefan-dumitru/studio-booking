import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

/**
 * A minimal wrapper over Radix's Dialog, hand-authored rather than pulled
 * from the shadcn CLI (interactive/network-dependent, unreliable in this
 * environment) -- same ownership model, just written directly. Radix supplies
 * focus trapping and restore-on-close for free (ui-guidelines.md >
 * Accessibility: "every dialog traps focus and restores it to the trigger").
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-black/40" />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2
            rounded-lg bg-white p-6 shadow-lg dark:bg-slate-900"
        >
          <DialogPrimitive.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </DialogPrimitive.Title>
          {description && (
            <DialogPrimitive.Description className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute top-4 right-4 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            ✕
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
