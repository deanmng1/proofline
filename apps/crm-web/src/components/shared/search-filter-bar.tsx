import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FilterChip = {
  id: string;
  label: string;
};

type SearchFilterBarProps = {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
  title?: string;
  description?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  inputId?: string;
  chips?: FilterChip[];
  activeChip?: string;
  onChipChange?: (id: string) => void;
};

export const SearchFilterBar = ({
  value,
  onChange,
  resultCount,
  title = "Search and filter",
  description = "Narrow the list down and keep follow-up work visible without opening a detail view.",
  searchLabel = "Search",
  searchPlaceholder,
  inputId = "search-filter-input",
  chips,
  activeChip,
  onChipChange,
}: SearchFilterBarProps) => (
  <div className="flex flex-col gap-4 rounded-[1rem] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] md:flex-row md:items-center md:justify-between">
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {typeof resultCount === "number" ? (
          <Badge variant="outline">{resultCount} visible</Badge>
        ) : null}
      </div>
      <p className="max-w-md text-sm text-[var(--muted-foreground)]">{description}</p>
      {chips && onChipChange ? (
        <fieldset>
          <legend className="sr-only">Filters</legend>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const isActive = activeChip === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onChipChange(chip.id)}
                  className={cn(
                    "min-h-9 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isActive
                      ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                      : "bg-[var(--surface-panel)] text-[var(--foreground-muted)] hover:bg-[var(--surface-secondary)]",
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
    </div>
    <div className="w-full md:max-w-sm">
      <Label
        htmlFor={inputId}
        className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]"
      >
        {searchLabel}
      </Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]"
          aria-hidden="true"
        />
        <Input
          id={inputId}
          type="search"
          aria-label={searchLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pl-9"
          placeholder={searchPlaceholder ?? searchLabel}
        />
      </div>
    </div>
  </div>
);
