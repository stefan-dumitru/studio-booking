import { Input, Label } from '../../components/ui/Input.js';
import type { ResourceType } from './types.js';

/**
 * All three controls fire immediately on change -- discrete controls, not
 * typing, so no debounce (performance.md > Constraints: debounce is only
 * for free-text search, which this isn't).
 */
export function Filters({
  date,
  onDateChange,
  typeIds,
  onTypeIdsChange,
  resourceTypes,
  from,
  onFromChange,
  to,
  onToChange,
}: {
  date: string;
  onDateChange: (date: string) => void;
  typeIds: readonly string[];
  onTypeIdsChange: (typeIds: readonly string[]) => void;
  resourceTypes: readonly ResourceType[];
  from: string;
  onFromChange: (from: string) => void;
  to: string;
  onToChange: (to: string) => void;
}): React.JSX.Element {
  function toggleType(id: string): void {
    onTypeIdsChange(
      typeIds.includes(id) ? typeIds.filter((t) => t !== id) : [...typeIds, id],
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <Label htmlFor="browse-date">Date</Label>
        <Input
          id="browse-date"
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="browse-from">From</Label>
        <Input
          id="browse-from"
          type="time"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="browse-to">To</Label>
        <Input
          id="browse-to"
          type="time"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
        />
      </div>

      {resourceTypes.length > 0 && (
        <fieldset className="mt-4">
          <legend className="text-sm text-slate-700 dark:text-slate-300">
            Type
          </legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {resourceTypes.map((type) => (
              <label key={type.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={typeIds.includes(type.id)}
                  onChange={() => toggleType(type.id)}
                />
                {type.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
