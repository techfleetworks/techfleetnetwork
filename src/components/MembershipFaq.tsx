import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/design-system";

import { MEMBERSHIP_FAQ } from "@/data/membership-faq";
import { cn } from "@/lib/utils";

export interface MembershipFaqProps {
  className?: string;
}

/**
 * Membership FAQ block — keyboard-accessible disclosure list rendered
 * under the tier grid. Uses Radix Accordion (aria-expanded handled by
 * the primitive) and a semantic <section> with an accessible name.
 */
export function MembershipFaq({ className }: MembershipFaqProps) {
  return (
    <section aria-labelledby="membership-faq-heading" className={cn("space-y-4", className)}>
      <h3 id="membership-faq-heading" className="text-lg font-semibold text-foreground">
        Membership FAQ
      </h3>
      <Accordion>
        {MEMBERSHIP_FAQ.map((entry) => (
          <AccordionItem key={entry.id}>
            <AccordionTrigger>{entry.question}</AccordionTrigger>
            <AccordionContent>{entry.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
