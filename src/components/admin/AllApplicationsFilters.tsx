import { X, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TEAM_HATS } from "@/data/project-constants";

export interface AppFilters {
  clientId: string;
  applicantSearch: string;
  teamHat: string;
}

export const EMPTY_FILTERS: AppFilters = {
  clientId: "",
  applicantSearch: "",
  teamHat: "",
};

interface Props {
  filters: AppFilters;
  onChange: (filters: AppFilters) => void;
  clients: { id: string; name: string }[];
}

export function AllApplicationsFilters({ filters, onChange, clients }: Props) {
  const hasFilters = filters.clientId || filters.applicantSearch || filters.teamHat;

  const update = (partial: Partial<AppFilters>) => onChange({ ...filters, ...partial });
  const reset = () => onChange({ ...EMPTY_FILTERS });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" aria-hidden />
          Filters
        </div>

        {/* Client */}
        <div className="w-48">
          <Select value={filters.clientId || "__all__"} onValueChange={(v) => update({ clientId: v === "__all__" ? "" : v })}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by client">
              <SelectValue placeholder="All Clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Applicant */}
        <div className="w-52">
          <Input
            placeholder="Search applicant…"
            className="h-9 text-sm"
            value={filters.applicantSearch}
            onChange={(e) => update({ applicantSearch: e.target.value })}
            aria-label="Search by applicant name or email"
          />
        </div>

        {/* Team Hat */}
        <div className="w-48">
          <Select value={filters.teamHat || "__all__"} onValueChange={(v) => update({ teamHat: v === "__all__" ? "" : v })}>
            <SelectTrigger className="h-9 text-sm" aria-label="Filter by team hat">
              <SelectValue placeholder="All Team Hats" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Team Hats</SelectItem>
              {TEAM_HATS.map((h) => (
                <SelectItem key={h} value={h}>{h}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs" onClick={reset}>
            <X className="h-3.5 w-3.5" /> Reset
          </Button>
        )}
      </div>

      {/* Applied filters display */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active:</span>
          {filters.clientId && (
            <Badge variant="secondary" className="text-xs gap-1">
              Client: {clients.find((c) => c.id === filters.clientId)?.name ?? "—"}
              <button onClick={() => update({ clientId: "" })} aria-label="Remove client filter" className="ml-0.5 hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.applicantSearch && (
            <Badge variant="secondary" className="text-xs gap-1">
              Applicant: "{filters.applicantSearch}"
              <button onClick={() => update({ applicantSearch: "" })} aria-label="Remove applicant filter" className="ml-0.5 hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.teamHat && (
            <Badge variant="secondary" className="text-xs gap-1">
              Team Hat: {filters.teamHat}
              <button onClick={() => update({ teamHat: "" })} aria-label="Remove team hat filter" className="ml-0.5 hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
