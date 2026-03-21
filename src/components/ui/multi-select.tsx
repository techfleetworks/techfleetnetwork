import { useState, useCallback, useMemo } from "react";
import { X, Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** When true, this option appears greyed out and cannot be selected */
  disabled?: boolean;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
  /** aria-label for the trigger button */
  "aria-label"?: string;
  /** aria-invalid for error state */
  "aria-invalid"?: boolean;
}

/**
 * Reusable searchable multi-select component with tag removal.
 * - Searchable by wildcard keyword (case-insensitive via cmdk)
 * - Displays selected items as removable badges/tags
 * - Allows zero to many selections
 * - Supports per-option disabled state
 * - WCAG accessible with keyboard navigation
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select options...",
  emptyMessage = "No options found.",
  className,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(
    (value: string) => {
      // Don't toggle if the option is disabled
      const option = options.find((o) => o.value === value);
      if (option?.disabled) return;

      onChange(
        selected.includes(value)
          ? selected.filter((s) => s !== value)
          : [...selected, value]
      );
    },
    [selected, onChange, options]
  );

  const remove = useCallback(
    (value: string) => {
      onChange(selected.filter((s) => s !== value));
    },
    [selected, onChange]
  );

  const selectedLabels = useMemo(() => {
    const labelMap = new Map(options.map((o) => [o.value, o.label]));
    return selected.map((v) => ({ value: v, label: labelMap.get(v) || v }));
  }, [selected, options]);

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal min-h-10 transition-colors",
              !selected.length && "text-muted-foreground",
              ariaInvalid && "border-destructive focus-visible:ring-destructive/40"
            )}
          >
            <span className="truncate">
              {selected.length > 0
                ? `${selected.length} selected`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => toggle(option.value)}
                    disabled={option.disabled}
                    className={cn(option.disabled && "opacity-50 cursor-not-allowed")}
                  >
                    <div
                      className={cn(
                        "mr-2 h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center",
                        selected.includes(option.value)
                          ? "bg-primary border-primary text-primary-foreground"
                          : option.disabled
                          ? "border-muted-foreground/30"
                          : "border-primary"
                      )}
                      aria-hidden="true"
                    >
                      {selected.includes(option.value) && (
                        <Check className="h-3 w-3" />
                      )}
                    </div>
                    <span className="text-sm">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected tags */}
      {selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Selected options">
          {selectedLabels.map(({ value, label }) => (
            <Badge
              key={value}
              variant="secondary"
              className="gap-1 pr-1 text-xs"
              role="listitem"
            >
              <span className="truncate max-w-[200px]">{label}</span>
              <button
                type="button"
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
                onClick={() => remove(value)}
                aria-label={`Remove ${label}`}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
