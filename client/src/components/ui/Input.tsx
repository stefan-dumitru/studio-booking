import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';

const fieldClassName =
  'mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className = '', ...props }, ref) {
  return (
    <input ref={ref} className={`${fieldClassName} ${className}`} {...props} />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = '', ...props }, ref) {
  return (
    <textarea ref={ref} className={`${fieldClassName} ${className}`} {...props} />
  );
});

// Radix's primitive rather than a plain <label>: it correctly focuses a
// custom, non-native control (the Select trigger below is a <button>, not a
// real <select>), which a bare htmlFor/id pairing can't do on its own.
export function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <LabelPrimitive.Root
      htmlFor={htmlFor}
      className="mt-4 block text-sm text-slate-700 dark:text-slate-300"
    >
      {children}
    </LabelPrimitive.Root>
  );
}
