import { useCallback, useMemo } from "react";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { EXPERIENCE_AREAS } from "@/lib/application-options";

const NOT_SURE = "I'm not sure yet";

/**
 * Experience Areas multi-select with mutual exclusion:
 * - "I'm not sure yet" is listed first, rest are alphabetical
 * - When "I'm not sure yet" is selected, all others are disabled/cleared
 * - When any other option is selected, "I'm not sure yet" is removed
 */
interface ExperienceAreasSelectProps {
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}

export function ExperienceAreasSelect({
  selected,
  onChange,
  placeholder = "Search and select areas...",
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: ExperienceAreasSelectProps) {
  const notSureSelected = selected.includes(NOT_SURE);

  const options: MultiSelectOption[] = useMemo(() => {
    // "I'm not sure yet" first, rest alphabetical (they're already sorted in the array minus the last item)
    const sorted = EXPERIENCE_AREAS.filter((e) => e !== NOT_SURE).slice().sort((a, b) => a.localeCompare(b));
    return [
      { value: NOT_SURE, label: NOT_SURE },
      ...sorted.map((e) => ({
        value: e,
        label: e,
        disabled: notSureSelected,
      })),
    ] as MultiSelectOption[];
  }, [notSureSelected]);

  const handleChange = useCallback(
    (newSelected: string[]) => {
      const wasNotSure = selected.includes(NOT_SURE);
      const isNotSure = newSelected.includes(NOT_SURE);

      if (isNotSure && !wasNotSure) {
        // User just selected "I'm not sure yet" — clear everything else
        onChange([NOT_SURE]);
      } else if (isNotSure && newSelected.length > 1) {
        // User selected another item while "not sure" was active — remove "not sure"
        onChange(newSelected.filter((v) => v !== NOT_SURE));
      } else {
        onChange(newSelected);
      }
    },
    [selected, onChange]
  );

  return (
    <MultiSelect
      options={options}
      selected={selected}
      onChange={handleChange}
      placeholder={notSureSelected ? "I'm not sure yet" : placeholder}
      disabled={disabled}
      aria-label={ariaLabel || "Experience areas"}
      aria-invalid={ariaInvalid}
    />
  );
}
