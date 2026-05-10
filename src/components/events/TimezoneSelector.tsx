import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const COMMON_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Athens",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

interface Props {
  value: string;
  onChange: (tz: string) => void;
}

export function TimezoneSelector({ value, onChange }: Props) {
  // Always include the current value (might be browser-detected).
  const zones = useMemo(() => {
    const set = new Set<string>(COMMON_ZONES);
    if (value) set.add(value);
    return Array.from(set).sort();
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="tz-select" className="text-xs text-muted-foreground whitespace-nowrap">
        Timezone
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="tz-select" className="h-8 w-[200px] text-xs" aria-label="Select timezone">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {zones.map((z) => (
            <SelectItem key={z} value={z} className="text-xs">
              {z.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
