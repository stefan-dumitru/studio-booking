import * as SelectPrimitive from '@radix-ui/react-select';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  disabled = false,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        className="mt-1 flex w-full items-center justify-between rounded-md border border-slate-300
          px-3 py-2 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100
          dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>▾</SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg
            dark:border-slate-700 dark:bg-slate-900"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="cursor-pointer rounded px-3 py-2 text-sm text-slate-900 outline-none
                  data-[highlighted]:bg-slate-100 dark:text-slate-100 dark:data-[highlighted]:bg-slate-800"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
