import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DetailField {
  label: string;
  value: string | string[] | undefined;
}

interface ResourceDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  category: string;
  categoryColorClass: string;
  fields: DetailField[];
  externalLink?: string;
  externalLinkLabel?: string;
}

export default function ResourceDetailPanel({
  open,
  onOpenChange,
  title,
  category,
  categoryColorClass,
  fields,
  externalLink,
  externalLinkLabel = "Open Resource",
}: ResourceDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent resizeKey="resource-detail" className="w-full sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`text-xs ${categoryColorClass}`}
            >
              {category}
            </Badge>
          </div>
          <SheetTitle className="text-lg leading-snug">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Details for {title}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 pr-2 -mr-2">
          <div className="space-y-5 py-4">
            {fields.map((field) => {
              if (!field.value || (Array.isArray(field.value) && field.value.length === 0)) return null;

              return (
                <div key={field.label} className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {field.label}
                  </p>
                  {Array.isArray(field.value) ? (
                    <div className="flex flex-wrap gap-1.5">
                      {field.value.map((v) => (
                        <Badge key={v} variant="secondary" className="text-xs font-normal">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground leading-relaxed">
                      {field.value}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {externalLink && (
          <div className="pt-4 border-t border-border">
            <a
              href={externalLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="w-full">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                {externalLinkLabel}
              </Button>
            </a>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
