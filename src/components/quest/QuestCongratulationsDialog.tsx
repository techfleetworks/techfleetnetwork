import { Button } from "@/components/ui/button";
import { PartyPopper } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface QuestCongratulationsDialogProps {
  open: boolean;
  pathTitle: string;
  onClose: () => void;
}

export function QuestCongratulationsDialog({
  open,
  pathTitle,
  onClose,
}: QuestCongratulationsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-2 mx-auto">
            <PartyPopper className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">Congratulations!</DialogTitle>
          <DialogDescription className="text-base">
            You've selected <span className="font-semibold text-foreground">{pathTitle}</span> as your quest. 
            Let's get started on your journey!
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="justify-center pt-2">
          <Button size="lg" onClick={onClose}>
            Let's Go!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
