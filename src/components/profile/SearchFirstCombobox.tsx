import { useCallback, useRef, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface SearchFirstComboboxOption {
  value: string;
  label: string;
}

interface SearchFirstComboboxProps {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedValue: string;
  selectedLabel: string;
  emptyLabel: string;
  searchPlaceholder: string;
  emptyMessage: string;
  options: SearchFirstComboboxOption[];
  icon: ReactNode;
  invalid?: boolean;
  triggerClassName?: string;
  contentClassName?: string;
  listClassName?: string;
  modal?: boolean;
  onSelect: (value: string) => void;
}

export function SearchFirstCombobox({
  id,
  open,
  onOpenChange,
  selectedValue,
  selectedLabel,
  emptyLabel,
  searchPlaceholder,
  emptyMessage,
  options,
  icon,
  invalid,
  triggerClassName,
  contentClassName,
  listClassName,
  modal,
  onSelect,
}: SearchFirstComboboxProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const focusSearch = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (nextOpen) focusSearch();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-invalid={invalid}
          className={cn("w-full justify-between pl-10 relative font-normal", !selectedValue && "text-muted-foreground", triggerClassName)}
        >
          {icon}
          <span className="truncate">{selectedLabel || emptyLabel}</span>
          <Search className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[--radix-popover-trigger-width] p-0", contentClassName)}
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          focusSearch();
        }}
      >
        <Command shouldFilter>
          <CommandInput ref={searchInputRef} placeholder={searchPlaceholder} className="text-base caret-primary" />
          <CommandList className={listClassName}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem key={option.value} value={option.label} onSelect={() => onSelect(option.value)}>
                  <Check className={cn("mr-2 h-4 w-4", selectedValue === option.value ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}